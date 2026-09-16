marked.setOptions({
    breaks: true,
    gfm: true
});

let pressTimer = null;
let startTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let hasMoved = false;

const MOVE_THRESHOLD = 15;
const PRESS_DURATION = 500;

const bookCache = new Map();

let globalConfig = {};
let currentUserId = null;
let cachedComments = [];
let currentSort = 'default';

let currentInputMode = null;
let currentCommentId = null;
let currentReplyToName = null;

let renderVersion = 0;
let reviewVersion = 0;
let previewVersion = 0;
let uiInitialized = false;

const BADGE_OPTIONS = {
    baseFontSize: 14,

    comment: {
        maxHeight: 21,
        maxWidth: 142.5
    },

    reply: {
        maxHeight: 16.5,
        maxWidth: 112.5
    }
};

const ICONS = {
    helpful: {
        outline: `
            <svg viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor"
                 stroke-linecap="round"
                 stroke-linejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
            </svg>
        `,
        filled: `
            <svg viewBox="0 0 24 24"
                 fill="currentColor"
                 stroke="currentColor"
                 stroke-linecap="round"
                 stroke-linejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
            </svg>
        `
    },

    not_helpful: {
        outline: `
            <svg viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor"
                 stroke-linecap="round"
                 stroke-linejoin="round">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
            </svg>
        `,
        filled: `
            <svg viewBox="0 0 24 24"
                 fill="currentColor"
                 stroke="currentColor"
                 stroke-linecap="round"
                 stroke-linejoin="round">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
            </svg>
        `
    }
};

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function formatNumber(value) {
    const number = Number(value) || 0;

    return number >= 1e4
        ? (number / 1e4).toFixed(1) + '万'
        : number.toLocaleString();
}

function makeId(prefix) {
    return (
        prefix + '_' +
        Date.now().toString(36) + '_' +
        Math.random().toString(36).slice(2, 10)
    );
}

function safeImageUrl(value, baseUrl = globalConfig.baseUrl) {
    if (!value) return '';

    try {
        const base = baseUrl
            ? String(baseUrl).replace(/\/+$/, '') + '/'
            : document.baseURI;

        const url = new URL(String(value), base);

        if (url.protocol === 'https:' || url.protocol === 'http:') {
            return url.href;
        }
    } catch {
    }

    return '';
}

function createAuthHeaders(userToken) {
    const headers = {};

    if (userToken) {
        headers.Authorization = userToken;
    }

    return headers;
}

function parseUserToken(userToken) {
    if (!userToken) return null;

    try {
        const token = String(userToken)
            .trim()
            .replace(/^Bearer\s+/i, '');

        const parts = token.split('.');
        if (parts.length < 2) return null;

        let payload = parts[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        payload = payload.padEnd(
            Math.ceil(payload.length / 4) * 4,
            '='
        );

        const binary = atob(payload);
        const bytes = Uint8Array.from(
            binary,
            char => char.charCodeAt(0)
        );

        const data = JSON.parse(
            new TextDecoder().decode(bytes)
        );

        return data.sub == null ? null : String(data.sub);
    } catch (error) {
        console.error('解析 token 失败:', error);
        return null;
    }
}

async function requestJSON(url, options = {}) {
    const response = await fetch(url, options);

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error(`服务器返回格式错误（HTTP ${response.status}）`);
    }

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            `请求失败（HTTP ${response.status}）`
        );
    }

    return result;
}

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) {
        alert(message);
        return;
    }
    const safeType = ['success', 'error', 'info'].includes(type) ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `toast-message ${safeType}`;
    toast.setAttribute('role', safeType === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-atomic', 'true');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = safeType === 'success' ? '✓' : safeType === 'error' ? '!' : 'i';
    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = String(message);
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'toast-close';
    dismiss.setAttribute('aria-label', '关闭提示');
    dismiss.textContent = '×';
    toast.append(icon, text, dismiss);
    container.appendChild(toast);

    let closed = false;
    let timer;
    const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 280);
    };
    void toast.offsetWidth;
    toast.classList.add('show');
    const milliseconds = Number(duration);
    timer = setTimeout(close, Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 3000);
    toast.addEventListener('click', close);
}

function refreshReview() {
    return getReview(
        globalConfig.baseUrl,
        globalConfig.bookName,
        globalConfig.chapterName,
        globalConfig.bookId,
        globalConfig.chapterId,
        globalConfig.detailUrl,
        globalConfig.coverUrl,
        globalConfig.userToken
    );
}

class SourceBadge extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({ mode: 'open' });

        this._built = false;
        this._frame = 0;
        this._observer = null;
        this._mutationObserver = null;
        this._fallbackTimer = null;

        this._scheduleBound = () => this.scheduleFit();
    }

    connectedCallback() {
        if (!this._built) {
            this._built = true;
            this.build();
        }

        this.startObservers();
        this.scheduleFit();

        if (document.fonts) {
            document.fonts.ready.then(() => {
                if (this.isConnected) {
                    this.scheduleFit();
                }
            });

            if (document.fonts.addEventListener) {
                document.fonts.addEventListener(
                    'loadingdone',
                    this._scheduleBound
                );
            }
        }

        window.addEventListener(
            'resize',
            this._scheduleBound,
            { passive: true }
        );
    }

    disconnectedCallback() {
        this._observer?.disconnect();
        this._mutationObserver?.disconnect();

        clearInterval(this._fallbackTimer);
        this._fallbackTimer = null;

        cancelAnimationFrame(this._frame);
        this._frame = 0;

        window.removeEventListener(
            'resize',
            this._scheduleBound
        );

        if (document.fonts?.removeEventListener) {
            document.fonts.removeEventListener(
                'loadingdone',
                this._scheduleBound
            );
        }
    }

    build() {
        let badge = {};

        try {
            badge = JSON.parse(
                this.getAttribute('data-badge') || '{}'
            );
        } catch {
        }

        const name = String(badge.name || '');

        this.title = String(
            badge.description || badge.name || ''
        );

        this.setAttribute('aria-label', name);

        const layoutStyle = document.createElement('style');
        layoutStyle.textContent = `
            :host {
                display: inline-block;
                position: relative;
                flex: 0 0 auto;
                vertical-align: middle;
                line-height: 0;
            }

            .viewport {
                position: relative;
                display: block;
                width: 0;
                height: 0;
                overflow: visible;
            }

            .scaler {
                position: absolute;
                top: 0;
                left: 0;
                display: block;
                width: max-content;
                transform-origin: left top;
                line-height: normal;
            }

            .source {
                display: flow-root;
                width: max-content;
            }
        `;

        this._viewport = document.createElement('div');
        this._viewport.className = 'viewport';

        this._scaler = document.createElement('div');
        this._scaler.className = 'scaler';

        this._source = document.createElement('span');
        this._source.className = 'source';

        this._sourceRoot = this._source.attachShadow({
            mode: 'open'
        });

        const baseStyle = document.createElement('style');
        baseStyle.textContent = `
            :host {
                font-family:
                    -apple-system,
                    BlinkMacSystemFont,
                    "Segoe UI",
                    Roboto,
                    sans-serif;
                font-size: ${BADGE_OPTIONS.baseFontSize}px;
                line-height: 1.4;
                color: #fff;
            }

            .badge {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                padding: 3px 10px;
                border-radius: 9999px;
                background: #94a3b8;
                color: #fff;
                font-size: inherit;
                font-weight: 600;
                line-height: 1.4;
                white-space: nowrap;
                vertical-align: middle;
            }

            .badge__text {
                position: relative;
                z-index: 1;
            }

            .badge-image {
                display: block;
                width: auto;
                height: auto;
                max-width: none;
                border: 0;
            }
        `;

        const sourceStyle = document.createElement('style');

        const customCSS = typeof badge.badge_css === 'string'
            ? badge.badge_css
            : '';
        sourceStyle.textContent = customCSS;

        this._sourceRoot.append(
            baseStyle,
            sourceStyle
        );

        const customHTML = typeof badge.badge_html === 'string'
            ? badge.badge_html.trim()
            : '';

        const imageUrl = safeImageUrl(
            badge.image_url,
            badge.base_url
        );

        if (customHTML && window.DOMPurify) {
            const fragment = DOMPurify.sanitize(customHTML, {
                RETURN_DOM_FRAGMENT: true,

                USE_PROFILES: {
                    html: true,
                    svg: true,
                    svgFilters: true
                },

                FORBID_TAGS: [
                    'script',
                    'style',
                    'iframe',
                    'object',
                    'embed',
                    'link',
                    'meta',
                    'base'
                ]
            });

            if (fragment.childNodes.length > 0) {
                this._sourceRoot.appendChild(fragment);
            } else {
                this.appendDefaultBadge(name);
            }
        } else if (
            !customHTML &&
            !customCSS.trim() &&
            imageUrl
        ) {
            const image = document.createElement('img');
            image.className = 'badge-image';
            image.src = imageUrl;
            image.alt = name;
            image.decoding = 'async';

            this._sourceRoot.appendChild(image);
        } else {
            this.appendDefaultBadge(name);
        }

        this._sourceRoot.querySelectorAll('img').forEach(image => {
            image.addEventListener(
                'load',
                this._scheduleBound
            );

            image.addEventListener(
                'error',
                this._scheduleBound
            );
        });

        this._scaler.appendChild(this._source);
        this._viewport.appendChild(this._scaler);

        this.shadowRoot.append(
            layoutStyle,
            this._viewport
        );
    }

    appendDefaultBadge(name) {
        const badge = document.createElement('span');
        badge.className = 'badge';

        const text = document.createElement('span');
        text.className = 'badge__text';
        text.textContent = name;

        badge.appendChild(text);
        this._sourceRoot.appendChild(badge);
    }

    startObservers() {
        this._observer?.disconnect();
        this._mutationObserver?.disconnect();

        if ('ResizeObserver' in window) {
            this._observer = new ResizeObserver(
                this._scheduleBound
            );

            this._observer.observe(this._source);

            if (this.parentElement) {
                this._observer.observe(this.parentElement);
            }
        } else {
            clearInterval(this._fallbackTimer);

            this._fallbackTimer = setInterval(
                this._scheduleBound,
                1000
            );
        }
        this._mutationObserver = new MutationObserver(
            this._scheduleBound
        );

        let parent = this.parentElement;

        while (parent && parent !== document.body) {
            this._mutationObserver.observe(parent, {
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden']
            });

            parent = parent.parentElement;
        }
    }

    scheduleFit() {
        if (!this.isConnected || this._frame) {
            return;
        }

        this._frame = requestAnimationFrame(() => {
            this._frame = 0;
            this.fit();
        });
    }

    fit() {
        if (!this._source) return;
        const width = Math.max(
            this._source.offsetWidth,
            this._source.scrollWidth
        );

        const height = Math.max(
            this._source.offsetHeight,
            this._source.scrollHeight
        );

        if (!width || !height) {
            return;
        }

        const options = this.getAttribute('size') === 'reply'
            ? BADGE_OPTIONS.reply
            : BADGE_OPTIONS.comment;

        let availableWidth = options.maxWidth;
        const parent = this.parentElement;

        if (parent && parent.clientWidth > 0) {
            const style = getComputedStyle(parent);

            availableWidth = parent.clientWidth
                - (parseFloat(style.paddingLeft) || 0)
                - (parseFloat(style.paddingRight) || 0);
        }

        const maxWidth = Math.max(
            1,
            Math.min(options.maxWidth, availableWidth)
        );

        const scale = Math.min(
            1,
            options.maxHeight / height,
            maxWidth / width
        );
        this._scaler.style.transform = `scale(${scale})`;

        const displayWidth = `${width * scale}px`;
        const displayHeight = `${height * scale}px`;

        if (this._viewport.style.width !== displayWidth) {
            this._viewport.style.width = displayWidth;
        }

        if (this._viewport.style.height !== displayHeight) {
            this._viewport.style.height = displayHeight;
        }
    }
}

if (!customElements.get('source-badge')) {
    customElements.define('source-badge', SourceBadge);
}

function renderSourceBadge(badge, isReply) {
    const data = {
        name: badge.name || '',
        description: badge.description || '',
        image_url: badge.image_url || '',
        badge_html: badge.badge_html || '',
        badge_css: badge.badge_css || '',
        base_url: globalConfig.baseUrl || ''
    };

    return `
        <source-badge
            size="${isReply ? 'reply' : 'comment'}"
            data-badge="${escapeHTML(JSON.stringify(data))}"
        ></source-badge>
    `;
}

const BLOCK_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <circle cx="12" cy="9" r="2.2" fill="currentColor"/>
        <path d="M7.8 17.2c.8-2.1 2.2-3.1 4.2-3.1s3.4 1 4.2 3.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M5.2 5.2 18.8 18.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
`;

async function blockUser(userId, btnElement) {
    if (btnElement?.disabled) return;
    if (!globalConfig.userToken) {
        showToast('请先登录', 'error');
        return;
    }
    if (!confirm(
        '确定要屏蔽「' + (btnElement?.dataset.userName || '该用户') +
        '」吗？\n\n屏蔽后将无法看到其后续发言。'
    )) return;

    if (btnElement) btnElement.disabled = true;
    try {
        const response = await fetch(
            `${globalConfig.baseUrl}/api/v2/users/${encodeURIComponent(userId)}/block`,
            { method: 'POST', headers: createAuthHeaders(globalConfig.userToken) }
        );
        if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
        showToast('屏蔽成功', 'success');
        await refreshReview();
    } catch (error) {
        showToast('屏蔽失败: ' + error.message, 'error');
    } finally {
        if (btnElement) btnElement.disabled = false;
    }
}

async function processBookTags(text) {
    const regex = /\[bookid:(\d+)(?:\s*\|\s*([a-z,\s]+))?\]/gi;

    return String(text).replace(
        regex,
        (match, bookId, optionText = '') => {
            const options = optionText
                .toLowerCase()
                .split(',')
                .map(value => value.trim());

            return `
<div
    class="book-card-placeholder"
    data-book-id="${bookId}"
    data-show-tags="${options.includes('tag') ? '1' : '0'}"
    data-show-bio="${options.includes('bio') ? '1' : '0'}"
><div class="book-loading">加载书籍信息...</div></div>
`;
        }
    );
}

function hydrateBookCards(container) {
    container.querySelectorAll(
        '.book-card-placeholder[data-book-id]'
    ).forEach(element => {
        if (element.dataset.bookLoaded) return;
        element.dataset.bookLoaded = '1';

        loadBookCard(
            element.dataset.bookId,
            element,
            globalConfig.baseUrl,
            element.dataset.showTags === '1',
            element.dataset.showBio === '1',
            globalConfig.userToken
        );
    });
}

async function loadBookCard(
    bookId,
    element,
    baseUrl,
    showTags,
    showBio,
    userToken
) {
    if (!element) return;

    element.innerHTML =
        '<div class="book-loading">加载书籍信息...</div>';

    const cacheKey = `${baseUrl}|${bookId}`;

    try {
        let data;

        if (bookCache.has(cacheKey)) {
            data = await bookCache.get(cacheKey);
        } else {
            const promise = requestJSON(
                `${baseUrl}/api/novel/detail.php?id=${
                    encodeURIComponent(bookId)
                }`,
                {
                    headers: createAuthHeaders(userToken)
                }
            ).then(result => {
                if (!result.success || !result.id) {
                    throw new Error('数据错误');
                }

                return result;
            });

            bookCache.set(cacheKey, promise);

            try {
                data = await promise;
                bookCache.set(cacheKey, data);
            } catch (error) {
                bookCache.delete(cacheKey);
                throw error;
            }
        }

        if (!element.isConnected) return;

        renderBookCard(
            element,
            data,
            showTags,
            showBio,
            baseUrl,
            bookId
        );
    } catch {
        if (!element.isConnected) return;

        element.innerHTML = `
            <div class="book-error">
                加载书籍信息失败
                <div style="font-size:11px;margin-top:4px">
                    ID: ${escapeHTML(bookId)}
                </div>
            </div>
        `;
    }
}

function renderBookCard(
    element,
    bookData,
    showTags,
    showBio,
    baseUrl,
    bookId
) {
    const title = String(bookData.title || '未知书籍');
    const authorName = String(bookData.authorName || '未知');
    const description = String(bookData.description || '');

    const tags = Array.isArray(bookData.tags)
        ? bookData.tags
        : [];

    const hasTags = showTags && tags.length > 0;
    const hasBio = showBio && description.trim().length > 0;

    const photoUrl = safeImageUrl(
        bookData.photoUrl,
        baseUrl
    );

    const cardLink = document.createElement('a');

    cardLink.href =
        `legado://import/addToBookshelf?src=${
            baseUrl
        }/book/${bookId},{"origin":"汉化论坛Top"}`;

    cardLink.style.cssText =
        'text-decoration:none;color:inherit;display:block';

    cardLink.innerHTML = `
        <div class="book-card">
            <div class="book-card-header">
                <div class="book-cover">
                    <img
                        ${photoUrl ? `src="${escapeHTML(photoUrl)}"` : ''}
                        alt="${escapeHTML(title)}"
                        loading="lazy"
                    >
                </div>

                <div class="book-info">
                    <div
                        class="book-title"
                        title="${escapeHTML(title)}"
                    >${escapeHTML(title)}</div>

                    <div class="book-author">
                        作者:${escapeHTML(authorName)}
                    </div>

                    <div class="book-stats">
                        <div class="book-stat-item">
                            <span>⭐</span>
                            <span>${
                                formatNumber(bookData.sourceFavoriteCount)
                            }</span>
                        </div>

                        <div class="book-stat-item">
                            <span>👁️</span>
                            <span>${
                                formatNumber(bookData.novelRead)
                            }</span>
                        </div>
                    </div>
                </div>
            </div>

            ${hasTags ? `
                <div class="book-tags-section show">
                    <div class="book-tags">
                        ${tags.map(tag => `
                            <span class="book-tag">${
                                escapeHTML(
                                    typeof tag === 'string'
                                        ? tag
                                        : tag.name || ''
                                )
                            }</span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${hasBio ? `
                <div class="book-description show">
                    <div
                        class="book-description-content"
                        title="${escapeHTML(description)}"
                    >${
                        escapeHTML(description).replace(/\n/g, '<br>')
                    }</div>
                </div>
            ` : ''}
        </div>
    `;

    const image = cardLink.querySelector('.book-cover img');

    const setFallback = () => {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg"
                 width="60" height="80">
                <rect width="60" height="80" fill="#f1f5f9"/>
                <text
                    x="30"
                    y="42"
                    text-anchor="middle"
                    font-family="sans-serif"
                    font-size="12"
                    fill="#94a3b8"
                >Cover</text>
            </svg>
        `;

        image.src =
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(svg);
    };

    image.addEventListener('error', setFallback, { once: true });

    if (!photoUrl) {
        setFallback();
    }

    element.replaceChildren(cardLink);
}

function processSpoiler(text) {
    return text.replace(
        /\|\|([^|]+)\|\|/g,
        (match, content) => {
            return (
                '<span class="spoiler" data-spoiler="true">' +
                content +
                '</span>'
            );
        }
    );
}

async function processFoldTags(text, baseUrl, userToken) {
    const regex = /\[fold:([^\]]+)\]([\s\S]*?)\[\/fold\]/g;

    let lastIndex = 0;
    const resultParts = [];
    let match;

    while ((match = regex.exec(text))) {
        resultParts.push(
            '\n\n' + text.slice(lastIndex, match.index)
        );

        const title = match[1];
        const content = match[2];
        const foldId = makeId('fold');

        const renderedContent = await renderMarkdown(
            content.trim(),
            baseUrl,
            userToken
        );

        resultParts.push(
        '\n\n' +
        '<div class="fold-container">\n' +
        '<div class="fold-header"' +
        ` data-fold="${foldId}"` +
        ' role="button"' +
        ' tabindex="0"' +
        ' aria-expanded="false">' +
        escapeHTML(title) +
        '</div>\n' +
        `<div class="fold-content" id="${foldId}">\n` +
        renderedContent.trim() +
        '\n</div>\n' +
        '</div>\n\n'
    );

        lastIndex = regex.lastIndex;
    }

    resultParts.push('\n\n' + text.slice(lastIndex));
    return resultParts.join('');
}

async function renderMarkdown(text, baseUrl, userToken) {
    const input = String(text ?? '');

    const withBooks = await processBookTags(input);
    const withFolds = await processFoldTags(
        withBooks,
        baseUrl,
        userToken
    );

    const withSpoilers = processSpoiler(withFolds);
    const html = marked.parse(withSpoilers);

    if (!window.DOMPurify) {
        return escapeHTML(input).replace(/\n/g, '<br>');
    }

    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },

        FORBID_TAGS: [
            'style',
            'script',
            'iframe',
            'object',
            'embed',
            'link',
            'meta',
            'base'
        ],
        FORBID_ATTR: ['style'],

        ALLOW_DATA_ATTR: true
    });
}

async function getComment(comments, baseUrl, userToken) {
    if (!Array.isArray(comments) || comments.length === 0) {
        return `
            <div class="no-comments">
                <div class="no-comments-icon">💬</div>
                <div class="no-comments-text">暂无评论</div>
            </div>
        `;
    }

    async function renderComment(
        comment,
        isReply = false,
        depth = 0,
        rootId = null
    ) {
        const currentRootId = depth === 0
            ? comment.id
            : rootId;

        const authorName = String(
            comment.authorName || '匿名用户'
        );

        const initial = Array.from(authorName)[0] || '?';

        const isOwnComment =
            currentUserId !== null &&
            String(comment.authorId) === String(currentUserId);

        const avatarUrl = safeImageUrl(
            comment.authorAvatar,
            baseUrl
        );

        const frameUrl = safeImageUrl(
            comment.authorAvatarFrame,
            baseUrl
        );

        const avatarClass = isReply
            ? 'reply-avatar'
            : 'user-avatar';

        const avatarContainerClass = isReply
            ? 'reply-avatar-container'
            : 'user-avatar-container';

        const infoClass = isReply
            ? 'reply-info'
            : 'user-info';

        const authorClass = isReply
            ? 'reply-author'
            : 'comment-author';

        const timeClass = isReply
            ? 'reply-time'
            : 'comment-time';

        const headerClass = isReply
            ? 'reply-header'
            : 'comment-header';

        const avatarContent = avatarUrl
            ? `
                <img
                    src="${escapeHTML(avatarUrl)}"
                    alt="${escapeHTML(authorName)}"
                >
            `
            : escapeHTML(initial);

        const frameHTML = frameUrl
            ? `
                <img
                    src="${escapeHTML(frameUrl)}"
                    class="${
                        isReply ? 'reply-avatar-frame' : 'avatar-frame'
                    }"
                    alt=""
                >
            `
            : '';

        const blockHTML = !isOwnComment && currentUserId !== null && comment.authorId != null
            ? `
                <button
                    class="block-btn"
                    data-user-id="${escapeHTML(comment.authorId)}"
                    data-user-name="${escapeHTML(authorName)}"
                    type="button"
                    aria-label="屏蔽 ${escapeHTML(authorName)}"
                    title="屏蔽该用户"
                >${BLOCK_ICON}</button>
            `
            : '';

        let badgesHTML = '';

        if (
            Array.isArray(comment.authorBadges) &&
            comment.authorBadges.length > 0
        ) {
            const badgeItems = comment.authorBadges
                .filter(badge => badge && typeof badge === 'object')
                .map(badge => renderSourceBadge(badge, isReply))
                .join('');

            badgesHTML = `
                <div class="${
                    isReply
                        ? 'reply-badges-section'
                        : 'badges-section'
                }">
                    <div class="${
                        isReply
                            ? 'reply-badges-container'
                            : 'badges-container'
                    }">
                        ${badgeItems}
                    </div>
                </div>
            `;
        }

        const reactions = Array.isArray(comment.userReactions)
            ? comment.userReactions
            : [];

        const helpfulActive = reactions.includes('helpful');
        const notHelpfulActive = reactions.includes('not_helpful');

        const statsHTML = `
            <div class="${isReply ? 'reply-stats' : 'comment-stats'}">
                <span
                    class="stat-item helpful ${
                        helpfulActive ? 'active' : ''
                    }"
                    data-id="${escapeHTML(comment.id)}"
                    data-type="helpful"
                    role="button"
                    tabindex="0"
                >
                    ${
                        helpfulActive
                            ? ICONS.helpful.filled
                            : ICONS.helpful.outline
                    }
                    <span class="count">${
                        Number(comment.helpfulCount) || 0
                    }</span>
                </span>

                <span
                    class="stat-item not-helpful ${
                        notHelpfulActive ? 'active' : ''
                    }"
                    data-id="${escapeHTML(comment.id)}"
                    data-type="not_helpful"
                    role="button"
                    tabindex="0"
                >
                    ${
                        notHelpfulActive
                            ? ICONS.not_helpful.filled
                            : ICONS.not_helpful.outline
                    }
                    <span class="count">${
                        Number(comment.notHelpfulCount) || 0
                    }</span>
                </span>
            </div>
        `;

        const contentHTML = await renderMarkdown(
            comment.content,
            baseUrl,
            userToken
        );

        const replyToHTML = isReply && comment.replyToName
            ? `
                <div class="reply-to-tag">
                    @ ${escapeHTML(comment.replyToName)}
                </div>
            `
            : '';

        const deleteHTML = isOwnComment
            ? `
                <button
                    class="action-btn delete ${
                        isReply
                            ? 'delete-reply-btn'
                            : 'delete-comment-btn'
                    }"
                    ${
                        isReply
                            ? `data-reply-id="${escapeHTML(comment.id)}"`
                            : `data-comment-id="${escapeHTML(comment.id)}"`
                    }
                    type="button"
                >🗑️ 删除</button>
            `
            : '';

        const actionsHTML = `
            <div class="${isReply ? 'reply-actions' : 'comment-actions'}">
                <div class="action-btns-group">
                    <button
                        class="action-btn reply-btn"
                        data-comment-id="${escapeHTML(currentRootId)}"
                        data-author-name="${escapeHTML(authorName)}"
                        type="button"
                    >💬 回复</button>

                    ${deleteHTML}
                </div>

                ${statsHTML}
            </div>
        `;

        let repliesHTML = '';

        const replies = Array.isArray(comment.replies)
            ? comment.replies
            : [];

        if (replies.length > 0) {
            const replyItems = await Promise.all(
                replies.map(reply => renderComment(
                    reply,
                    true,
                    depth + 1,
                    currentRootId
                ))
            );

            if (depth === 0) {
                const repliesId = makeId('replies');

                repliesHTML = `
                    <div class="replies-toggle">
                        <div
                            class="replies-toggle-btn"
                            data-replies="${repliesId}"
                            role="button"
                            tabindex="0"
                            aria-expanded="false"
                        >
                            <div class="triangle"></div>
                            <div class="reply-count">
                                ${replies.length}
                            </div>
                        </div>
                    </div>

                    <div
                        class="replies-container"
                        id="${repliesId}"
                    >${replyItems.join('')}</div>
                `;
            } else {
                repliesHTML = `
                    <div class="replies-container expanded">
                        ${replyItems.join('')}
                    </div>
                `;
            }
        }

        return `
            <div class="${isReply ? 'reply-item' : 'comment-item'}">
                ${replyToHTML}

                <div class="${headerClass}">
                    <div class="${avatarContainerClass}">
                        <div class="${
                            avatarClass
                        }${avatarUrl ? ' has-image' : ''}">
                            ${avatarContent}
                        </div>

                        ${frameHTML}
                    </div>

                    <div class="${infoClass}">
                        <div class="author-line">
                            <span class="${authorClass}">
                                ${escapeHTML(authorName)}
                            </span>
                            ${blockHTML}
                        </div>

                        <span class="${timeClass}">
                            ${escapeHTML(comment.createdAt || '')}
                        </span>
                    </div>
                </div>

                ${badgesHTML}

                <div class="${
                    isReply ? 'reply-content' : 'comment-content'
                }">${contentHTML}</div>

                ${actionsHTML}
                ${repliesHTML}
            </div>
        `;
    }

    const items = await Promise.all(
        comments.map(comment => renderComment(comment))
    );

    return items.join('');
}

async function getReview(
    baseUrl,
    bookName,
    chapterName,
    bookId,
    chapterId,
    detailUrl,
    coverUrl,
    userToken
) {
    const version = ++reviewVersion;

    const commentType = chapterId ? 'chapter' : 'book';

    const chapterParam = chapterId
        ? `&chapter_id=${encodeURIComponent(chapterId)}`
        : '';

    const apiUrl =
        `${baseUrl}/api/comment/list.php` +
        `?type=${commentType}` +
        `&book_id=${encodeURIComponent(bookId)}` +
        chapterParam +
        '&limit=60';

    try {
        document.getElementById('bookTitle').textContent =
            bookName;

        document.getElementById('chapterTitle').textContent =
            chapterName || '书评';

        const headers = createAuthHeaders(userToken);

        const firstData = await requestJSON(
            `${apiUrl}&page=1`,
            { headers }
        );

        if (firstData.success === false) {
            throw new Error(firstData.message || '加载失败');
        }

        let allComments = Array.isArray(firstData.comments)
            ? firstData.comments
            : [];

        const totalPages = Math.max(
            1,
            Number(firstData.pages) || 1
        );

        for (let page = 2; page <= totalPages; page++) {
            const data = await requestJSON(
                `${apiUrl}&page=${page}`,
                { headers }
            );

            if (data.success === false) {
                throw new Error(data.message || '加载失败');
            }

            allComments = allComments.concat(
                Array.isArray(data.comments) ? data.comments : []
            );
        }

        if (version !== reviewVersion) return;

        cachedComments = allComments;
        await renderSortedComments();
    } catch (error) {
        if (version !== reviewVersion) return;

        console.error('加载评论失败:', error);

        document.getElementById('commentsList').innerHTML =
            '<div class="error">加载失败，请稍后重试</div>';
    }
}

function getSortedComments() {
    const list = [...cachedComments];

    if (currentSort === 'reverse') {
        list.reverse();
    } else if (currentSort === 'hot') {
        list.sort((a, b) => {
            return (
                (Number(b.helpfulCount) || 0) -
                (Number(a.helpfulCount) || 0)
            );
        });
    }

    return list;
}

async function renderSortedComments() {
    const version = ++renderVersion;
    const container = document.getElementById('commentsList');

    container.innerHTML =
        '<div class="loading">排序中...</div>';

    const html = await getComment(
        getSortedComments(),
        globalConfig.baseUrl,
        globalConfig.userToken
    );

    if (version !== renderVersion) return;

    container.innerHTML = html;

    bindInteractiveElements(container);
    bindActionButtons(container);
}

function initSortBar() {
    const button = document.getElementById('sortBarBtn');
    const dropdown = document.getElementById('sortDropdown');
    const label = document.getElementById('sortBarLabel');
    const arrow = document.getElementById('sortBarArrow');

    if (!button || !dropdown) return;

    const options = Array.from(
        dropdown.querySelectorAll('.sort-option')
    );

    const labels = {
        default: '默认排序',
        reverse: '倒序',
        hot: '热度优先'
    };

    function syncWidth() {
        dropdown.style.visibility = 'hidden';
        dropdown.style.display = 'flex';

        const dropdownWidth = dropdown.offsetWidth;

        dropdown.style.display = '';
        dropdown.style.visibility = '';

        const width = Math.max(
            button.offsetWidth,
            dropdownWidth
        );

        button.style.width = width + 'px';
        dropdown.style.width = width + 'px';
    }

    function closeDropdown() {
        dropdown.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
        arrow.textContent = '▾';
    }

    button.addEventListener('click', event => {
        event.stopPropagation();

        if (dropdown.classList.contains('open')) {
            closeDropdown();
        } else {
            syncWidth();
            dropdown.classList.add('open');
            button.setAttribute('aria-expanded', 'true');
            arrow.textContent = '▴';
        }
    });

    document.addEventListener('click', event => {
        if (
            !button.contains(event.target) &&
            !dropdown.contains(event.target)
        ) {
            closeDropdown();
        }
    });

    options.forEach(option => {
        option.addEventListener('click', async event => {
            event.stopPropagation();

            const sort = option.dataset.sort;
            closeDropdown();

            if (sort === currentSort || !labels[sort]) return;

            currentSort = sort;

            options.forEach(item => {
                item.classList.toggle('active', item === option);
            });

            label.textContent = labels[sort];

            try {
                await renderSortedComments();
            } catch (error) {
                showToast('排序失败: ' + error.message, 'error');
            }
        });
    });
}

function toggleCover(coverUrl) {
    const coverBox = document.getElementById('coverBox');
    const coverImage = document.getElementById('coverImage');

    if (coverBox.classList.contains('expanded')) {
        coverBox.classList.remove('expanded');
        return;
    }

    const url = safeImageUrl(coverUrl);

    if (url) {
        coverImage.src = url;
    } else {
        const isDark = window.matchMedia(
            '(prefers-color-scheme: dark)'
        ).matches;

        const background = isDark ? '#333' : '#f1f5f9';
        const foreground = isDark ? '#666' : '#94a3b8';

        const svg = `
            <svg width="300" height="400"
                 xmlns="http://www.w3.org/2000/svg">
                <rect
                    width="100%"
                    height="100%"
                    fill="${background}"
                />
                <text
                    x="50%"
                    y="50%"
                    font-family="sans-serif"
                    font-size="40"
                    fill="${foreground}"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    style="writing-mode:vertical-rl"
                >暂无封面</text>
            </svg>
        `;

        coverImage.src =
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(svg);
    }

    coverBox.classList.add('expanded');
}

function initFabMenu() {
    const main = document.getElementById('fabMain');
    const options = document.getElementById('fabOptions');

    main.addEventListener('click', () => {
        main.classList.toggle('active');
        options.classList.toggle('active');
    });

    document.getElementById('fabJump').addEventListener(
        'click',
        () => {
            if (globalConfig.detailUrl) {
                window.location.href = globalConfig.detailUrl;
            }
        }
    );

    document.getElementById('fabComment').addEventListener(
        'click',
        () => openInputPanel('comment')
    );
}

function insertAtCursor(textarea, text, offset = 0) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    textarea.value =
        value.slice(0, start) +
        text +
        value.slice(end);

    textarea.selectionStart =
        textarea.selectionEnd =
        start + offset;

    textarea.focus();
}

function initMarkdownShortcuts() {
    const field = document.getElementById('inputField');

    document.getElementById('markdownShortcuts')
        .addEventListener('click', event => {
            const button = event.target.closest('.shortcut-btn');
            if (!button) return;

            const selected = field.value.substring(
                field.selectionStart,
                field.selectionEnd
            );

            let text = '';
            let offset = 0;

            switch (button.dataset.syntax) {
                case 'bold':
                    text = `**${selected || '粗体文本'}**`;
                    offset = selected ? text.length : 2;
                    break;

                case 'italic':
                    text = `*${selected || '斜体文本'}*`;
                    offset = selected ? text.length : 1;
                    break;

                case 'code-inline':
                    text = `\`${selected || '代码'}\``;
                    offset = selected ? text.length : 1;
                    break;

                case 'code-block':
                    text =
                        '\n```\n' +
                        (selected || '// Your code here') +
                        '\n```\n';

                    offset = selected ? text.length - 4 : 5;
                    break;

                case 'blockquote':
                    text = `> ${selected || '引用内容'}`;
                    offset = selected ? text.length : 2;
                    break;

                case 'list':
                    text = `- ${selected || '列表项'}`;
                    offset = selected ? text.length : 2;
                    break;

                case 'link':
                    text =
                        `[${selected || '链接文本'}]` +
                        '(https://example.com)';

                    offset = selected ? text.length : 1;
                    break;

                case 'image':
                    text =
                        `![${selected || '图片描述'}]` +
                        '(https://example.com/image.jpg)';

                    offset = 2;
                    break;

                case 'bookid':
                    text = '[bookid:353686|tag,bio]';
                    offset = 8;
                    break;

                case 'fold':
                    text = '[fold:点击展开]折叠内容[/fold]';
                    offset = 6;
                    break;

                case 'spoiler':
                    text = '||剧透内容||';
                    offset = 2;
                    break;

                default:
                    return;
            }

            insertAtCursor(field, text, offset);
        });
}

function setInputTab(tab) {
    document.querySelectorAll('.input-tab-btn')
        .forEach(button => {
            button.classList.toggle(
                'active',
                button.dataset.tab === tab
            );
        });

    document.querySelectorAll('.input-tab-content')
        .forEach(content => {
            content.classList.toggle(
                'active',
                content.dataset.tabContent === tab
            );
        });

    document.getElementById('markdownShortcuts')
        .classList.toggle('hidden', tab === 'preview');
}

function openInputPanel(mode, commentId = null, authorName = null) {
    const overlay = document.getElementById('inputOverlay');
    const title = document.getElementById('inputTitle');
    const subtitle = document.getElementById('inputSubtitle');
    const field = document.getElementById('inputField');

    currentInputMode = mode;
    currentCommentId = commentId;
    currentReplyToName = authorName;

    previewVersion++;

    if (mode === 'comment') {
        title.textContent = globalConfig.chapterId
            ? '发表章评'
            : '发表书评';

        subtitle.textContent = '分享你的想法';
    } else {
        title.textContent = '回复评论';
        subtitle.textContent = `@ ${authorName || ''}`;
    }

    field.value = '';

    setInputTab('edit');

    document.getElementById('inputPreview').innerHTML = '';

    overlay.classList.add('active');
    field.focus();
}

function closeInputPanel() {
    document.getElementById('inputOverlay')
        .classList.remove('active');

    currentInputMode = null;
    currentCommentId = null;
    currentReplyToName = null;

    previewVersion++;
}

async function submitInput() {
    const field = document.getElementById('inputField');
    const content = field.value.trim();

    if (!content) {
        showToast('请输入内容', 'error');
        return;
    }

    if (!globalConfig.userToken) {
        showToast('未登录，无法发表评论', 'error');
        return;
    }

    if (!['comment', 'reply'].includes(currentInputMode)) {
        return;
    }

    const submitButton = document.getElementById('inputSubmit');

    if (submitButton.disabled) return;

    submitButton.disabled = true;
    submitButton.textContent = '发送中...';

    try {
        const headers = createAuthHeaders(
            globalConfig.userToken
        );

        headers['Content-Type'] = 'application/json';

        let url;
        let body;

        if (currentInputMode === 'comment') {
            url =
                `${globalConfig.baseUrl}/api/comment/create.php`;

            body = {
                type: globalConfig.chapterId ? 'chapter' : 'book',
                book_id: globalConfig.bookId,
                content
            };

            if (globalConfig.chapterId) {
                body.chapter_id = globalConfig.chapterId;
            }
        } else {
            url =
                `${globalConfig.baseUrl}/api/comment/reply.php`;

            body = {
                comment_id: currentCommentId,
                content,
                reply_to_name: currentReplyToName
            };
        }

        const result = await requestJSON(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!result.success) {
            throw new Error(result.message || '发表失败');
        }

        showToast('发表成功', 'success');
        closeInputPanel();

        await refreshReview();
    } catch (error) {
        console.error('发表失败:', error);
        showToast('发表失败: ' + error.message, 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '发送';
    }
}

function initInputPanel() {
    const overlay = document.getElementById('inputOverlay');

    overlay.addEventListener('click', event => {
        if (event.target === overlay) {
            closeInputPanel();
        }
    });

    document.getElementById('inputCancel')
        .addEventListener('click', closeInputPanel);

    document.getElementById('inputSubmit')
        .addEventListener('click', submitInput);

    document.querySelectorAll('.input-tab-btn')
        .forEach(button => {
            button.addEventListener('click', async () => {
                const tab = button.dataset.tab;
                const version = ++previewVersion;

                setInputTab(tab);

                if (tab !== 'preview') return;

                const preview = document.getElementById('inputPreview');

                preview.innerHTML =
                    '<div class="book-loading">渲染中...</div>';

                try {
                    const html = await renderMarkdown(
                        document.getElementById('inputField').value,
                        globalConfig.baseUrl,
                        globalConfig.userToken
                    );

                    if (version !== previewVersion) return;

                    preview.innerHTML = html;
                    bindInteractiveElements(preview);
                } catch (error) {
                    if (version !== previewVersion) return;

                    preview.textContent =
                        '预览失败: ' + error.message;
                }
            });
        });

    initMarkdownShortcuts();
}

async function deleteEntry(id, isReply) {
    const label = isReply ? '回复' : '评论';

    if (!confirm(`确定要删除这条${label}吗？`)) {
        return;
    }

    if (!globalConfig.userToken) {
        showToast(`未登录，无法删除${label}`, 'error');
        return;
    }

    try {
        const headers = createAuthHeaders(
            globalConfig.userToken
        );

        headers['Content-Type'] = 'application/json';

        const body = isReply
            ? { reply_id: id }
            : { comment_id: id };

        const result = await requestJSON(
            `${globalConfig.baseUrl}/api/comment/delete.php`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            }
        );

        if (!result.success) {
            throw new Error(result.message || '删除失败');
        }

        showToast('删除成功', 'success');
        await refreshReview();
    } catch (error) {
        console.error('删除失败:', error);
        showToast('删除失败: ' + error.message, 'error');
    }
}

function deleteComment(commentId) {
    return deleteEntry(commentId, false);
}

function deleteReply(replyId) {
    return deleteEntry(replyId, true);
}

function findCachedComment(id, isReply) {
    function visit(list, replyLevel) {
        for (const item of list) {
            if (
                replyLevel === isReply &&
                String(item.id) === String(id)
            ) {
                return item;
            }

            if (Array.isArray(item.replies)) {
                const found = visit(item.replies, true);
                if (found) return found;
            }
        }

        return null;
    }

    return visit(cachedComments, false);
}

function updateReactionButton(button, type, active, count) {
    button.classList.toggle('active', active);

    button.innerHTML = `
        ${active ? ICONS[type].filled : ICONS[type].outline}
        <span class="count">${Number(count) || 0}</span>
    `;
}

async function handleReaction(
    commentId,
    reactionType,
    targetElement
) {
    if (!globalConfig.userToken) {
        showToast('请先登录后再进行操作', 'error');
        return;
    }

    if (!ICONS[reactionType]) return;

    const statsContainer = targetElement.closest(
        '.comment-stats, .reply-stats'
    );

    if (!statsContainer || statsContainer.dataset.pending) {
        return;
    }

    statsContainer.dataset.pending = '1';

    statsContainer.querySelectorAll('.stat-item')
        .forEach(button => button.classList.add('pending'));

    try {
        const headers = createAuthHeaders(
            globalConfig.userToken
        );

        headers['Content-Type'] = 'application/json';

        const isReply = statsContainer.classList.contains(
            'reply-stats'
        );

        const body = {
            reaction_type: reactionType
        };

        if (isReply) {
            body.reply_id = parseInt(commentId, 10);
        } else {
            body.comment_id = parseInt(commentId, 10);
        }

        const result = await requestJSON(
            `${globalConfig.baseUrl}/api/comment/react.php`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            }
        );

        if (!result.success || !result.counts) {
            throw new Error(result.message || '操作失败');
        }

        const helpfulButton = statsContainer.querySelector(
            '.helpful'
        );

        const notHelpfulButton = statsContainer.querySelector(
            '.not-helpful'
        );

        let helpfulActive = helpfulButton.classList.contains('active');
        let notHelpfulActive = notHelpfulButton.classList.contains('active');

        const serverReactions =
            Array.isArray(result.userReactions)
                ? result.userReactions
                : Array.isArray(result.user_reactions)
                    ? result.user_reactions
                    : null;

        if (serverReactions) {
            helpfulActive = serverReactions.includes('helpful');
            notHelpfulActive = serverReactions.includes('not_helpful');
        } else if (reactionType === 'helpful') {
            helpfulActive = !helpfulActive;
        } else {
            notHelpfulActive = !notHelpfulActive;
        }

        updateReactionButton(
            helpfulButton,
            'helpful',
            helpfulActive,
            result.counts.helpful
        );

        updateReactionButton(
            notHelpfulButton,
            'not_helpful',
            notHelpfulActive,
            result.counts.not_helpful
        );

        const cached = findCachedComment(commentId, isReply);

        if (cached) {
            cached.helpfulCount =
                Number(result.counts.helpful) || 0;

            cached.notHelpfulCount =
                Number(result.counts.not_helpful) || 0;

            cached.userReactions = [
                ...(helpfulActive ? ['helpful'] : []),
                ...(notHelpfulActive ? ['not_helpful'] : [])
            ];
        }
    } catch (error) {
        console.error('评价失败:', error);
        showToast('操作失败: ' + error.message, 'error');
    } finally {
        delete statsContainer.dataset.pending;

        statsContainer.querySelectorAll('.stat-item')
            .forEach(button => button.classList.remove('pending'));
    }
}

function bindActionButtons(
    container = document.getElementById('commentsList')
) {
    container.querySelectorAll('.reply-btn').forEach(button => {
        button.addEventListener('click', () => {
            openInputPanel(
                'reply',
                button.dataset.commentId,
                button.dataset.authorName
            );
        });
    });

    container.querySelectorAll('.delete-comment-btn')
        .forEach(button => {
            button.addEventListener('click', () => {
                deleteComment(button.dataset.commentId);
            });
        });

    container.querySelectorAll('.delete-reply-btn')
        .forEach(button => {
            button.addEventListener('click', () => {
                deleteReply(button.dataset.replyId);
            });
        });

    container.querySelectorAll('.block-btn')
        .forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();

                event.preventDefault();
                blockUser(
                    button.dataset.userId,
                    button
                );
            });
        });

    container.querySelectorAll('.stat-item')
        .forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();

                handleReaction(
                    button.dataset.id,
                    button.dataset.type,
                    button
                );
            });

            button.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    button.click();
                }
            });
        });
}

function bindInteractiveElements(container) {
    container.querySelectorAll('.spoiler').forEach(spoiler => {
        if (spoiler.dataset.bound) return;
        spoiler.dataset.bound = '1';

        spoiler.addEventListener('click', revealSpoilerClick);

        spoiler.addEventListener(
            'touchstart',
            spoilerTouchStart,
            { passive: true }
        );

        spoiler.addEventListener(
            'touchmove',
            spoilerTouchMove,
            { passive: true }
        );

        spoiler.addEventListener(
            'touchend',
            spoilerTouchEnd,
            { passive: false }
        );

        spoiler.addEventListener(
            'touchcancel',
            spoilerTouchCancel
        );
    });

    container.querySelectorAll('.fold-header').forEach(header => {
        if (header.dataset.bound) return;
        header.dataset.bound = '1';

        header.addEventListener('click', toggleFoldClick);

        header.addEventListener(
            'touchend',
            toggleFoldTouchEnd,
            { passive: false }
        );

        header.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                header.click();
            }
        });
    });

    container.querySelectorAll('.replies-toggle-btn')
        .forEach(button => {
            if (button.dataset.bound) return;
            button.dataset.bound = '1';

            button.addEventListener('click', toggleRepliesClick);

            button.addEventListener(
                'touchend',
                toggleRepliesTouchEnd,
                { passive: false }
            );

            button.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    button.click();
                }
            });
        });

    hydrateBookCards(container);
}

function revealSpoilerClick(event) {
    const target = event.currentTarget;

    if (Date.now() < Number(target.dataset.suppressClickUntil || 0)) {
        event.preventDefault();
        return;
    }

    if (!target.classList.contains('revealed')) {
        target.classList.add('revealed');
    }
}

function spoilerTouchStart(event) {
    const target = event.currentTarget;

    if (target.classList.contains('revealed')) return;

    startTime = Date.now();
    hasMoved = false;

    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;

    clearTimeout(pressTimer);

    pressTimer = setTimeout(() => {
        if (!hasMoved) {
            target.classList.add('temp-show');
        }
    }, PRESS_DURATION);
}

function spoilerTouchMove(event) {
    const target = event.currentTarget;

    const deltaX = Math.abs(
        event.touches[0].clientX - touchStartX
    );

    const deltaY = Math.abs(
        event.touches[0].clientY - touchStartY
    );

    if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
        hasMoved = true;

        clearTimeout(pressTimer);
        pressTimer = null;

        target.classList.remove('temp-show');
    }
}

function spoilerTouchEnd(event) {
    const target = event.currentTarget;

    clearTimeout(pressTimer);
    pressTimer = null;

    target.classList.remove('temp-show');

    if (target.classList.contains('revealed')) return;

    const duration = Date.now() - startTime;

    target.dataset.suppressClickUntil = String(Date.now() + 700);

    if (!hasMoved) {
        event.preventDefault();

        if (duration < PRESS_DURATION) {
            target.classList.add('revealed');
        }
    }
}

function spoilerTouchCancel(event) {
    clearTimeout(pressTimer);
    pressTimer = null;

    event.currentTarget.classList.remove('temp-show');
    hasMoved = true;
}

function toggleFold(header) {
    const content = document.getElementById(
        header.dataset.fold
    );

    if (!content) return;

    const expanded = header.classList.toggle('expanded');

    content.classList.toggle('expanded', expanded);
    header.setAttribute('aria-expanded', String(expanded));
}

function toggleFoldClick(event) {
    const header = event.currentTarget;

    if (
        Date.now() <
        Number(header.dataset.suppressClickUntil || 0)
    ) {
        return;
    }

    toggleFold(header);
}

function toggleFoldTouchEnd(event) {
    const header = event.currentTarget;

    header.dataset.suppressClickUntil = String(Date.now() + 700);

    if (!hasMoved) {
        event.preventDefault();
        toggleFold(header);
    }
}

function toggleReplies(button) {
    const container = document.getElementById(
        button.dataset.replies
    );

    if (!container) return;

    const expanded = button.classList.toggle('expanded');

    container.classList.toggle('expanded', expanded);
    button.setAttribute('aria-expanded', String(expanded));

    if (expanded) {
        container.querySelectorAll('source-badge')
            .forEach(badge => badge.scheduleFit?.());
    }
}

function toggleRepliesClick(event) {
    const button = event.currentTarget;

    if (
        Date.now() <
        Number(button.dataset.suppressClickUntil || 0)
    ) {
        return;
    }

    toggleReplies(button);
}

function toggleRepliesTouchEnd(event) {
    const button = event.currentTarget;

    button.dataset.suppressClickUntil = String(Date.now() + 700);

    if (!hasMoved) {
        event.preventDefault();
        toggleReplies(button);
    }
}

function showImageViewer(target) {
    if (!window.Viewer) {
        showToast('图片查看组件尚未加载', 'error');
        return;
    }

    const viewer = new Viewer(target, {
        navbar: false,
        title: false,

        toolbar: {
            zoomIn: 1,
            zoomOut: 1,
            oneToOne: 1,
            reset: 1,
            rotateLeft: 1,
            rotateRight: 1,
            flipHorizontal: 1,
            flipVertical: 1
        },

        keyboard: false,

        hidden() {
            viewer.destroy();
        }
    });

    viewer.show();
}

function initImageViewer() {
    document.addEventListener('click', event => {
        const path = event.composedPath
            ? event.composedPath()
            : [event.target];

        const target = path.find(node => {
            return node instanceof Element &&
                node.tagName === 'IMG';
        });

        if (!target) return;

        const insideViewerOrCard = path.some(node => {
            return node instanceof Element &&
                node.matches(
                    '.avatar-frame, ' +
                    '.reply-avatar-frame, ' +
                    '.book-card, ' +
                    '.viewer-container'
                );
        });

        if (insideViewerOrCard) return;

        if (
            target.closest(
                '.avatar-frame, ' +
                '.reply-avatar-frame, ' +
                '.book-card, ' +
                '.viewer-container'
            )
        ) {
            return;
        }

        if (
            target.id === 'coverImage' &&
            !document.getElementById('coverBox')
                .classList.contains('expanded')
        ) {
            return;
        }

        const inBadge = path.some(node => {
            return node instanceof Element &&
                node.tagName === 'SOURCE-BADGE';
        });

        if (inBadge) {
            const copy = document.createElement('img');
            copy.src = target.currentSrc || target.src;
            copy.alt = target.alt || '';

            showImageViewer(copy);
        } else {
            showImageViewer(target);
        }
    });
}

document.addEventListener(
    'touchstart',
    event => {
        if (!event.touches.length) return;

        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        hasMoved = false;
    },
    { passive: true }
);

document.addEventListener(
    'touchmove',
    event => {
        if (hasMoved || !event.touches.length) return;

        const deltaX = Math.abs(
            event.touches[0].clientX - touchStartX
        );

        const deltaY = Math.abs(
            event.touches[0].clientY - touchStartY
        );

        if (
            deltaX > MOVE_THRESHOLD ||
            deltaY > MOVE_THRESHOLD
        ) {
            hasMoved = true;
        }
    },
    { passive: true }
);

document.addEventListener(
    'touchcancel',
    () => {
        hasMoved = true;

        clearTimeout(pressTimer);

        pressTimer = null;
    },
    { passive: true }
);

function initComments(config) {
    if (!Array.isArray(config)) {
        document.getElementById('commentsList').innerHTML =
            '<div class="error">配置格式错误</div>';

        return;
    }

    const baseUrl = String(config[0] || '').replace(/\/+$/, '');
    const bookName = config[1] || '未知书籍';
    const bookId = config[2] || '';
    const chapterName = config[3] || '';
    const chapterId = config[4] || '';
    const detailUrl = config[5] || '#';
    const coverUrl = config[6] || '';
    const userToken = config[7] || '';

    globalConfig = {
        baseUrl,
        bookName,
        bookId,
        chapterName,
        chapterId,
        detailUrl,
        coverUrl,
        userToken
    };

    currentUserId = parseUserToken(userToken);

    if (!uiInitialized) {
        uiInitialized = true;

        initFabMenu();
        initImageViewer();
        initInputPanel();
        initSortBar();

        const header = document.getElementById('headerBox');

        header.addEventListener('click', event => {
            if (event.target.id !== 'coverImage') {
                toggleCover(globalConfig.coverUrl);
            }
        });

        header.style.cursor = 'pointer';
    }

    if (!window.DOMPurify) {
        showToast(
            'HTML 净化组件加载失败，部分内容将以纯文本显示',
            'error',
            5000
        );
    }

    if (baseUrl && bookId) {
        refreshReview();
    } else {
        document.getElementById('commentsList').innerHTML =
            '<div class="error">缺少必要参数</div>';
    }
}