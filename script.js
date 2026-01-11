marked.setOptions({breaks: true, gfm: true});

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

const formatNumber = n => n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : n.toLocaleString();

function createAuthHeaders(userToken) {
    const headers = {};
    if (userToken) {
        headers['Authorization'] = userToken;
    }
    return headers;
}

function parseUserToken(userToken) {
    if (!userToken) return null;
    try {
        const token = userToken.trim().replace(/^Bearer\s+/, '');
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = JSON.parse(atob(parts[1]));
        return payload.sub || null;
    } catch (e) {
        console.error('解析token失败:', e);
        return null;
    }
}

function showToast(message, type = 'info', duration = 5000) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        alert(message);
        return;
    }

    const toast = document.createElement('div');
    toast.classList.add('toast-message', type);
    
    let icon = '';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❎';
    else icon = 'ℹ️';

    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    
    toastContainer.appendChild(toast);

    void toast.offsetWidth; 
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

async function processBookTags(text, baseUrl, userToken) {
    const regex = /\[bookid:(\d+)(?:\s*\|\s*([a-z,]+))?\]/g;
    let lastIndex = 0;
    let result = '';
    let match;

    while (match = regex.exec(text)) {
        result += text.slice(lastIndex, match.index);
        const bookId = match[1];
        const options = match[2] ? match[2].toLowerCase().split(',').map(t => t.trim()) : [];
        const showTags = options.includes('tag');
        const showBio = options.includes('bio');
        const cardId = `book-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        result += `<div id="${cardId}"></div>`;
        
        setTimeout(() => loadBookCard(bookId, cardId, baseUrl, showTags, showBio, userToken), 0);
        lastIndex = regex.lastIndex;
    }

    result += text.slice(lastIndex);
    return result;
}

async function loadBookCard(bookId, elementId, baseUrl, showTags, showBio, userToken) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = '<div class="book-loading">加载书籍信息...</div>';

    try {
        if (bookCache.has(bookId)) {
            return renderBookCard(element, bookCache.get(bookId), showTags, showBio, baseUrl, bookId);
        }

        const headers = createAuthHeaders(userToken);
        const response = await fetch(`${baseUrl}/api/novel/detail.php?id=${bookId}`, { headers });
        const data = await response.json();

        if (!response.ok || !data.success || !data.id) {
            throw new Error('数据错误');
        }

        bookCache.set(bookId, data);
        renderBookCard(element, data, showTags, showBio, baseUrl, bookId);
    } catch (error) {
        element.innerHTML = `<div class="book-error">加载书籍信息失败<div style="font-size:11px;margin-top:4px">ID: ${bookId}</div></div>`;
    }
}

function renderBookCard(element, bookData, showTags, showBio, baseUrl, bookId) {
    const {title, photoUrl, authorName, sourceFavoriteCount, novelRead, tags, description} = bookData;
    const hasTags = showTags && tags && tags.length > 0;
    const hasBio = showBio && description && description.trim().length > 0;

    const cardLink = document.createElement('a');
    cardLink.href = `legado://import/addToBookshelf?src=${baseUrl}/book-detail/${bookId},{"origin":"汉化论坛Top"}`;
    cardLink.style.cssText = 'text-decoration:none;color:inherit;display:block';
    cardLink.innerHTML = `
        <div class="book-card">
            <div class="book-card-header">
                <div class="book-cover">
                    <img src="${photoUrl}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA2MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjFmNWY5Ii8+Cjx0ZXh0IHg9IjMwIiB5PSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM5NDBhM2I4Ij5Db3ZlcjwvdGV4dD4KPC9zdmc+'">
                </div>
                <div class="book-info">
                    <div class="book-title" title="${title}">${title}</div>
                    <div class="book-author">作者:${authorName}</div>
                    <div class="book-stats">
                        <div class="book-stat-item"><span>⭐</span><span>${formatNumber(sourceFavoriteCount)}</span></div>
                        <div class="book-stat-item"><span>👁️</span><span>${formatNumber(novelRead)}</span></div>
                    </div>
                </div>
            </div>
            ${hasTags ? `
            <div class="book-tags-section show">
                <div class="book-tags">${tags.map(tag => `<span class="book-tag">${tag}</span>`).join('')}</div>
            </div>` : ''}
            ${hasBio ? `
            <div class="book-description show">
                <div class="book-description-content" title="${description}">${description.replace(/\n/g, '<br>')}</div>
            </div>` : ''}
        </div>
    `;

    element.innerHTML = '';
    element.appendChild(cardLink);
}

function processSpoiler(text) {
    return text.replace(/\|\|([^\|]+)\|\|/g, (match, content) => {
        return `<span class="spoiler" data-spoiler="true">${content}</span>`;
    });
}

async function processFoldTags(text, baseUrl, userToken) {
    const regex = /\[fold:([^\]]+)\]([\s\S]*?)\[\/fold\]/g;
    let lastIndex = 0;
    let resultParts = [];
    let match;

    while (match = regex.exec(text)) {
        resultParts.push('\n\n' + text.slice(lastIndex, match.index));

        const title = match[1];
        const content = match[2];
        const foldId = 'fold_' + Math.random().toString(36).substr(2, 9);
        
        const renderedContent = await renderMarkdown(content.trim(), baseUrl, userToken);

        resultParts.push(`\n\n<div class="fold-container">
            <div class="fold-header" data-fold="${foldId}">${title}</div>
            <div class="fold-content" id="${foldId}">${renderedContent}</div>
        </div>\n\n`);

        lastIndex = regex.lastIndex;
    }

    resultParts.push('\n\n' + text.slice(lastIndex));
    return resultParts.join('');
}

async function renderMarkdown(text, baseUrl, userToken) {
    const processedBookTagsText = await processBookTags(text, baseUrl, userToken);
    const processedFoldText = await processFoldTags(processedBookTagsText, baseUrl, userToken);
    const processedSpoilerText = processSpoiler(processedFoldText);
    return marked.parse(processedSpoilerText);
}

function getRandomGradient() {
    const gradients = [
        ['#9a67ea', '#ff7ac7'], ['#8b5cf6', '#ec4899'], ['#7c3aed', '#db2777'],
        ['#6366f1', '#d946ef'], ['#3b82f6', '#a855f7'], ['#f59e0b', '#ef4444'],
        ['#f97316', '#dc2626'], ['#ea580c', '#b91c1c'], ['#059669', '#0891b2'],
        ['#10b981', '#06b6d4'], ['#14b8a6', '#0ea5e9'], ['#06b6d4', '#3b82f6'],
        ['#0284c7', '#6366f1'], ['#6366f1', '#ec4899'], ['#7c3aed', '#e11d48'],
        ['#8b5cf6', '#f43f5e'], ['#a855f7', '#ef4444'], ['#d946ef', '#f97316'],
        ['#ec4899', '#f59e0b'], ['#be185d', '#ea580c'], ['#047857', '#0369a1'],
        ['#059669', '#0284c7'], ['#10b981', '#0891b2'], ['#14b8a6', '#06b6d4'],
        ['#0d9488', '#0284c7'], ['#dc2626', '#7c2d12'], ['#b91c1c', '#92400e'],
        ['#991b1b', '#78350f'], ['#6d28d9', '#be185d'], ['#5b21b6', '#9d174d']
    ];

    const colors = gradients[Math.floor(Math.random() * gradients.length)];
    const angle = Math.floor(Math.random() * 360);
    return `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1]})`;
}

async function getComment(data, baseUrl, userToken) {
    const comments = data.comments;

    if (!comments || comments.length === 0) {
        return '<div class="no-comments"><div class="no-comments-icon">💬</div><div class="no-comments-text">暂无评论</div></div>';
    }

    async function renderComment(comment, isReply = false, depth = 0, userToken) {
        const initial = comment.authorName ? comment.authorName.charAt(0) : '?';
        let avatarContent = '';
        let avatarStyle = '';
        let frameHtml = '';
        let badgesHtml = '';

        if (comment.authorAvatar) {
            avatarContent = `<img src="${comment.authorAvatar}" alt="${comment.authorName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            avatarStyle = ' style="background:none;overflow:hidden"';
        } else {
            avatarContent = initial;
        }

        if (comment.authorAvatarFrame) {
            const frameClass = isReply ? 'reply-avatar-frame' : 'avatar-frame';
            frameHtml = `<img src="${comment.authorAvatarFrame}" class="${frameClass}" style="position:absolute;top:-25%;left:-25%;width:150%;height:150%;z-index:2;pointer-events:none;object-fit:contain;transform:scale(1.2)">`;
        }

        if (comment.authorBadges && comment.authorBadges.length > 0) {
            const badgeItems = comment.authorBadges.map(badge => 
                `<span class="${isReply ? 'reply-badge-item' : 'badge-item'}" style="background:${getRandomGradient()}">${badge.name}</span>`
            ).join('');
            badgesHtml = `<div class="${isReply ? 'reply-badges-section' : 'badges-section'}">
                <div class="${isReply ? 'reply-badges-container' : 'badges-container'}">${badgeItems}</div>
            </div>`;
        }

        let statsHtml = `<div class="${isReply ? 'reply-stats' : 'comment-stats'}">
            <span class="stat-item helpful">👍 ${comment.helpfulCount}</span>
            <span class="stat-item not-helpful">👎 ${comment.notHelpfulCount}</span>
        </div>`;

        const contentHtml = await renderMarkdown(comment.content, baseUrl, userToken);
        
        const isOwnComment = currentUserId && comment.authorId === currentUserId;
        
        let actionsHtml = '';
        if (isReply) {
            actionsHtml = `<div class="reply-actions">
                <div class="action-btns-group">
                    <button class="action-btn reply-btn" data-comment-id="${comment.id}" data-author-name="${comment.authorName}">💬 回复</button>
                    ${isOwnComment ? `<button class="action-btn delete delete-reply-btn" data-reply-id="${comment.id}">🗑️ 删除</button>` : ''}
                </div>
                ${statsHtml}
            </div>`;
        } else {
            actionsHtml = `<div class="comment-actions">
                <div class="action-btns-group">
                    <button class="action-btn reply-btn" data-comment-id="${comment.id}" data-author-name="${comment.authorName}">💬 回复</button>
                    ${isOwnComment ? `<button class="action-btn delete delete-comment-btn" data-comment-id="${comment.id}">🗑️ 删除</button>` : ''}
                </div>
                ${statsHtml}
            </div>`;
        }

        let repliesHtml = '';
        const replies = comment.replies || [];

        if (replies.length > 0) {
            if (depth === 0) {
                const repliesId = 'replies_' + Math.random().toString(36).substr(2, 9);
                const replyItems = await Promise.all(replies.map(reply => renderComment(reply, true, depth + 1, userToken)));
                repliesHtml = `
                    <div class="replies-toggle">
                        <div class="replies-toggle-btn" data-replies="${repliesId}">
                            <div class="triangle"></div>
                            <div class="reply-count">${replies.length}</div>
                        </div>
                    </div>
                    <div class="replies-container" id="${repliesId}">${replyItems.join('')}</div>
                `;
            } else {
                const replyItems = await Promise.all(replies.map(reply => renderComment(reply, true, depth + 1, userToken)));
                repliesHtml = `<div class="replies-container expanded">${replyItems.join('')}</div>`;
            }
        }

        if (isReply) {
            return `<div class="reply-item">
                <div class="reply-header">
                    <div class="reply-avatar-container">
                        <div class="reply-avatar"${avatarStyle}>${avatarContent}</div>
                        ${frameHtml}
                    </div>
                    <div class="reply-info">
                        <span class="reply-author">${comment.authorName}</span>
                        <span class="reply-time">${comment.createdAt}</span>
                    </div>
                </div>
                ${badgesHtml}
                <div class="reply-content">${contentHtml}</div>
                ${actionsHtml}
                ${repliesHtml}
            </div>`;
        } else {
            return `<div class="comment-item">
                <div class="comment-header">
                    <div class="user-avatar-container">
                        <div class="user-avatar"${avatarStyle}>${avatarContent}</div>
                        ${frameHtml}
                    </div>
                    <div class="user-info">
                        <span class="comment-author">${comment.authorName}</span>
                        <span class="comment-time">${comment.createdAt}</span>
                    </div>
                </div>
                ${badgesHtml}
                <div class="comment-content">${contentHtml}</div>
                ${actionsHtml}
                ${repliesHtml}
            </div>`;
        }
    }

    const commentItems = await Promise.all(comments.map(comment => renderComment(comment, false, 0, userToken)));
    return commentItems.join('');
}

async function getReview(baseUrl, bookName, chapterName, bookId, chapterId, detailUrl, coverUrl, userToken) {
    const commentType = chapterId ? 'chapter' : 'book';
    const chapterParam = chapterId ? `&chapter_id=${chapterId}` : '';
    const apiUrl = `${baseUrl}/api/comment/list.php?type=${commentType}&book_id=${bookId}${chapterParam}&limit=60`;

    try {
        document.getElementById('bookTitle').textContent = bookName;
        document.getElementById('chapterTitle').textContent = chapterName || '书评';

        let allCommentsHtml = '';
        const headers = createAuthHeaders(userToken);

        const firstResponse = await fetch(`${apiUrl}&page=1`, { headers });
        const firstData = await firstResponse.json();
        allCommentsHtml += await getComment(firstData, baseUrl, userToken);

        const totalPages = firstData.pages || 1;
        for (let page = 2; page <= totalPages; page++) {
            const response = await fetch(`${apiUrl}&page=${page}`, { headers });
            const data = await response.json();
            allCommentsHtml += await getComment(data, baseUrl, userToken);
        }

        document.getElementById('commentsList').innerHTML = allCommentsHtml;

        document.querySelectorAll('.user-avatar, .reply-avatar').forEach(avatar => {
            if (!avatar.querySelector('img')) {
                avatar.style.background = getRandomGradient();
            }
        });
        
        bindInteractiveElements(document.getElementById('commentsList'));
        bindActionButtons();
    } catch (error) {
        console.error('加载评论失败:', error);
        document.getElementById('commentsList').innerHTML = '<div class="error">加载失败,请稍后重试</div>';
    }
}

function toggleCover(coverUrl) {
    const coverBox = document.getElementById('coverBox');
    const coverImage = document.getElementById('coverImage');

    if (coverBox.classList.contains('expanded')) {
        coverBox.classList.remove('expanded');
    } else {
        coverImage.src = coverUrl;
        coverBox.classList.add('expanded');
    }
}

function initFabMenu() {
    const fabMain = document.getElementById('fabMain');
    const fabOptions = document.getElementById('fabOptions');
    const fabJump = document.getElementById('fabJump');
    const fabComment = document.getElementById('fabComment');

    fabMain.addEventListener('click', () => {
        fabMain.classList.toggle('active');
        fabOptions.classList.toggle('active');
    });

    fabJump.addEventListener('click', () => {
        if (globalConfig.detailUrl) {
            window.location.href = globalConfig.detailUrl;
        }
    });

    fabComment.addEventListener('click', () => {
        openInputPanel('comment');
    });
}

function insertAtCursor(textarea, text, offset = 0) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    textarea.value = value.substring(0, start) + text + value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + offset;
    textarea.focus();
}

function initMarkdownShortcuts() {
    const inputField = document.getElementById('inputField');
    document.getElementById('markdownShortcuts').addEventListener('click', (e) => {
        const btn = e.target.closest('.shortcut-btn');
        if (!btn) return;

        const syntax = btn.dataset.syntax;
        let textToInsert = '';
        let cursorOffset = 0;
        const selectedText = inputField.value.substring(inputField.selectionStart, inputField.selectionEnd);

        switch (syntax) {
            case 'bold':
                textToInsert = `**${selectedText || '粗体文本'}**`;
                cursorOffset = selectedText ? textToInsert.length : 2;
                break;
            case 'italic':
                textToInsert = `*${selectedText || '斜体文本'}*`;
                cursorOffset = selectedText ? textToInsert.length : 1;
                break;
            case 'code-inline':
                textToInsert = `\`${selectedText || '代码'}\``;
                cursorOffset = selectedText ? textToInsert.length : 1;
                break;
            case 'code-block':
                textToInsert = `\n\`\`\`\n${selectedText || '// Your code here'}\n\`\`\`\n`;
                cursorOffset = selectedText ? textToInsert.length - 4 : 5;
                break;
            case 'blockquote':
                textToInsert = `> ${selectedText || '引用内容'}`;
                cursorOffset = selectedText ? textToInsert.length : 2;
                break;
            case 'list':
                textToInsert = `- ${selectedText || '列表项'}`;
                cursorOffset = selectedText ? textToInsert.length : 2;
                break;
            case 'link':
                textToInsert = `[${selectedText || '链接文本'}](https://example.com)`;
                cursorOffset = selectedText ? textToInsert.length : 1;
                break;
            case 'image':
                textToInsert = `![${selectedText || '图片描述'}](https://example.com/image.jpg)`;
                cursorOffset = 2;
                break;
            case 'bookid':
                textToInsert = `[bookid:353686|tag,bio]`;
                cursorOffset = 9;
                break;
            case 'fold':
                textToInsert = `[fold:点击展开]折叠内容[/fold]`;
                cursorOffset = 5;
                break;
            case 'spoiler':
                textToInsert = `||剧透内容||`;
                cursorOffset = 2;
                break;
        }
        insertAtCursor(inputField, textToInsert, cursorOffset);
    });
}

let currentInputMode = null;
let currentCommentId = null;
let currentReplyToName = null;

function openInputPanel(mode, commentId = null, authorName = null) {
    const overlay = document.getElementById('inputOverlay');
    const title = document.getElementById('inputTitle');
    const subtitle = document.getElementById('inputSubtitle');
    const field = document.getElementById('inputField');
    const editTabBtn = document.querySelector('.input-tab-btn[data-tab="edit"]');
    const previewTabBtn = document.querySelector('.input-tab-btn[data-tab="preview"]');
    const editTabContent = document.querySelector('.input-tab-content[data-tab-content="edit"]');
    const previewTabContent = document.querySelector('.input-tab-content[data-tab-content="preview"]');
    const markdownShortcuts = document.getElementById('markdownShortcuts');

    currentInputMode = mode;
    currentCommentId = commentId;
    currentReplyToName = authorName;

    if (mode === 'comment') {
        const isChapter = !!globalConfig.chapterId;
        title.textContent = isChapter ? '发表章评' : '发表书评';
        subtitle.textContent = '分享你的想法';
    } else if (mode === 'reply') {
        title.textContent = '回复评论';
        subtitle.textContent = `@ ${authorName}`;
    }

    field.value = '';
    overlay.classList.add('active');
    field.focus();
    
    editTabBtn.classList.add('active');
    previewTabBtn.classList.remove('active');
    editTabContent.classList.add('active');
    previewTabContent.classList.remove('active');
    markdownShortcuts.classList.remove('hidden');
    document.getElementById('inputPreview').innerHTML = '';
}

function closeInputPanel() {
    const overlay = document.getElementById('inputOverlay');
    overlay.classList.remove('active');
    currentInputMode = null;
    currentCommentId = null;
    currentReplyToName = null;
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

    const submitBtn = document.getElementById('inputSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = '发送中...';

    try {
        const headers = createAuthHeaders(globalConfig.userToken);
        headers['Content-Type'] = 'application/json';

        let url, body;

        if (currentInputMode === 'comment') {
            url = `${globalConfig.baseUrl}/api/comment/create.php`;
            body = {
                type: globalConfig.chapterId ? 'chapter' : 'book',
                book_id: globalConfig.bookId,
                content: content
            };
            if (globalConfig.chapterId) {
                body.chapter_id = globalConfig.chapterId;
            }
        } else if (currentInputMode === 'reply') {
            url = `${globalConfig.baseUrl}/api/comment/reply.php`;
            body = {
                comment_id: currentCommentId,
                content: content,
                reply_to_name: currentReplyToName
            };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('发表成功', 'success');
            closeInputPanel();
            await getReview(
                globalConfig.baseUrl,
                globalConfig.bookName,
                globalConfig.chapterName,
                globalConfig.bookId,
                globalConfig.chapterId,
                globalConfig.detailUrl,
                globalConfig.coverUrl,
                globalConfig.userToken
            );
        } else {
            throw new Error(result.message || '发表失败');
        }
    } catch (error) {
        console.error('发表失败:', error);
        showToast('发表失败: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '发送';
    }
}

async function deleteComment(commentId) {
    if (!confirm('确定要删除这条评论吗？')) {
        return;
    }

    if (!globalConfig.userToken) {
        showToast('未登录，无法删除评论', 'error');
        return;
    }

    try {
        const headers = createAuthHeaders(globalConfig.userToken);
        headers['Content-Type'] = 'application/json';

        const response = await fetch(`${globalConfig.baseUrl}/api/comment/delete.php`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ comment_id: commentId })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('删除成功', 'success');
            await getReview(
                globalConfig.baseUrl,
                globalConfig.bookName,
                globalConfig.chapterName,
                globalConfig.bookId,
                globalConfig.chapterId,
                globalConfig.detailUrl,
                globalConfig.coverUrl,
                globalConfig.userToken
            );
        } else {
            throw new Error(result.message || '删除失败');
        }
    } catch (error) {
        console.error('删除失败:', error);
        showToast('删除失败: ' + error.message, 'error');
    }
}

async function deleteReply(replyId) {
    if (!confirm('确定要删除这条回复吗？')) {
        return;
    }

    if (!globalConfig.userToken) {
        showToast('未登录，无法删除回复', 'error');
        return;
    }

    try {
        const headers = createAuthHeaders(globalConfig.userToken);
        headers['Content-Type'] = 'application/json';

        const response = await fetch(`${globalConfig.baseUrl}/api/comment/delete.php`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ reply_id: replyId })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('删除成功', 'success');
            await getReview(
                globalConfig.baseUrl,
                globalConfig.bookName,
                globalConfig.chapterName,
                globalConfig.bookId,
                globalConfig.chapterId,
                globalConfig.detailUrl,
                globalConfig.coverUrl,
                globalConfig.userToken
            );
        } else {
            throw new Error(result.message || '删除失败');
        }
    } catch (error) {
        console.error('删除失败:', error);
        showToast('删除失败: ' + error.message, 'error');
    }
}

function bindActionButtons() {
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const commentId = btn.dataset.commentId;
            const authorName = btn.dataset.authorName;
            openInputPanel('reply', commentId, authorName);
        });
    });
    
    document.querySelectorAll('.delete-comment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const commentId = btn.dataset.commentId;
            deleteComment(commentId);
        });
    });
    
    document.querySelectorAll('.delete-reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const replyId = btn.dataset.replyId;
            deleteReply(replyId);
        });
    });
}

function bindInteractiveElements(container) {
    container.querySelectorAll('.spoiler').forEach(spoiler => {
        spoiler.removeEventListener('click', revealSpoilerClick);
        spoiler.removeEventListener('touchstart', spoilerTouchStart);
        spoiler.removeEventListener('touchmove', spoilerTouchMove);
        spoiler.removeEventListener('touchend', spoilerTouchEnd);
        spoiler.addEventListener('click', revealSpoilerClick);
        spoiler.addEventListener('touchstart', spoilerTouchStart, {passive: true});
        spoiler.addEventListener('touchmove', spoilerTouchMove, {passive: true});
        spoiler.addEventListener('touchend', spoilerTouchEnd, {passive: false});
    });
    
    container.querySelectorAll('.fold-header').forEach(header => {
        header.removeEventListener('click', toggleFoldClick);
        header.removeEventListener('touchend', toggleFoldTouchEnd);
        header.addEventListener('click', toggleFoldClick);
        header.addEventListener('touchend', toggleFoldTouchEnd, {passive: false});
    });
    
    container.querySelectorAll('.replies-toggle-btn').forEach(btn => {
        btn.removeEventListener('click', toggleRepliesClick);
        btn.removeEventListener('touchend', toggleRepliesTouchEnd);
        btn.addEventListener('click', toggleRepliesClick);
        btn.addEventListener('touchend', toggleRepliesTouchEnd, {passive: false});
    });
}

function revealSpoilerClick(e) {
    const target = e.target;
    if (target.dataset.spoiler && !target.classList.contains('revealed')) {
        target.classList.add('revealed');
    }
}

function spoilerTouchStart(e) {
    const target = e.target;
    if (target.dataset.spoiler && !target.classList.contains('revealed')) {
        startTime = Date.now();
        pressTimer = setTimeout(() => {
            if (!hasMoved) {
                target.classList.add('temp-show');
            }
        }, PRESS_DURATION);
    }
}

function spoilerTouchMove(e) {
    const target = e.target;
    if (target.dataset.spoiler) {
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);

        if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
            hasMoved = true;
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            target.classList.remove('temp-show');
        }
    }
}

function spoilerTouchEnd(e) {
    const target = e.target;
    if (target.dataset.spoiler && !target.classList.contains('revealed')) {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }

        const pressDuration = Date.now() - startTime;
        target.classList.remove('temp-show');

        if (pressDuration < PRESS_DURATION && !hasMoved) {
            e.preventDefault();
            target.classList.add('revealed');
        }
    }
    hasMoved = false;
}

function toggleFoldClick(e) {
    const header = e.target.closest('.fold-header');
    if (header) {
        const foldContent = document.getElementById(header.dataset.fold);
        if (foldContent) {
            header.classList.toggle('expanded');
            foldContent.classList.toggle('expanded');
        }
    }
}

function toggleFoldTouchEnd(e) {
    const header = e.target.closest('.fold-header');
    if (header && !hasMoved) {
        e.preventDefault();
        const foldContent = document.getElementById(header.dataset.fold);
        if (foldContent) {
            header.classList.toggle('expanded');
            foldContent.classList.toggle('expanded');
        }
    }
}

function toggleRepliesClick(e) {
    const toggleBtn = e.target.closest('.replies-toggle-btn');
    if (toggleBtn) {
        const repliesContainer = document.getElementById(toggleBtn.dataset.replies);
        if (repliesContainer) {
            toggleBtn.classList.toggle('expanded');
            repliesContainer.classList.toggle('expanded');
        }
    }
}

function toggleRepliesTouchEnd(e) {
    const toggleBtn = e.target.closest('.replies-toggle-btn');
    if (toggleBtn && !hasMoved) {
        e.preventDefault();
        const repliesContainer = document.getElementById(toggleBtn.dataset.replies);
        if (repliesContainer) {
            toggleBtn.classList.toggle('expanded');
            repliesContainer.classList.toggle('expanded');
        }
    }
}

function initImageViewer() {
    const viewer = document.createElement('div');
    viewer.id = 'imageViewer';
    viewer.className = 'image-viewer';
    viewer.innerHTML = `
        <div class="viewer-overlay"></div>
        <img id="viewerImg" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="">
    `;
    document.body.appendChild(viewer);

    const viewerImg = document.getElementById('viewerImg');
    let scale = 1, lastScale = 1;
    let translateX = 0, translateY = 0;
    let startX = 0, startY = 0;
    let initialDist = 0;
    let isPanning = false;

    const updateTransform = () => {
        viewerImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };

    const close = () => {
        viewer.classList.remove('active');
        setTimeout(() => {
            viewerImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
            scale = 1; lastScale = 1;
            translateX = 0; translateY = 0;
            updateTransform();
        }, 300);
    };

    viewer.querySelector('.viewer-overlay').onclick = close;

    viewerImg.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            startX = e.touches[0].pageX - translateX;
            startY = e.touches[0].pageY - translateY;
            isPanning = true;
        } else if (e.touches.length === 2) {
            isPanning = false;
            initialDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            lastScale = scale;
        }
    }, {passive: false});

    viewerImg.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isPanning) {
            e.preventDefault();
            translateX = e.touches[0].pageX - startX;
            translateY = e.touches[0].pageY - startY;
            updateTransform();
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            scale = Math.max(1, Math.min(5, (dist / initialDist) * lastScale));
            updateTransform();
        }
    }, {passive: false});

    viewerImg.addEventListener('touchend', () => {
        lastScale = scale;
        isPanning = false;
    });

    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.tagName !== 'IMG' || target.id === 'viewerImg') return;
        if (target.closest('.avatar-frame') || target.closest('.reply-avatar-frame') || target.closest('.book-card')) return;
        if (target.id === 'coverImage' && !document.getElementById('coverBox').classList.contains('expanded')) return;

        viewerImg.src = target.src;
        viewer.classList.add('active');
        scale = 1; lastScale = 1;
        translateX = 0; translateY = 0;
        updateTransform();
    });
}

function initInputPanel() {
    const overlay = document.getElementById('inputOverlay');
    const cancelBtn = document.getElementById('inputCancel');
    const submitBtn = document.getElementById('inputSubmit');
    const inputField = document.getElementById('inputField');
    const previewDiv = document.getElementById('inputPreview');
    const tabButtons = document.querySelectorAll('.input-tab-btn');
    const tabContents = document.querySelectorAll('.input-tab-content');
    const markdownShortcuts = document.getElementById('markdownShortcuts');
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeInputPanel();
        }
    });

    cancelBtn.addEventListener('click', closeInputPanel);
    submitBtn.addEventListener('click', submitInput);
    
    tabButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const targetTab = button.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.querySelector(`.input-tab-content[data-tab-content="${targetTab}"]`).classList.add('active');

            if (targetTab === 'preview') {
                markdownShortcuts.classList.add('hidden');
                const markdownText = inputField.value;
                previewDiv.innerHTML = '<div class="book-loading">渲染中...</div>';
                const renderedHtml = await renderMarkdown(markdownText, globalConfig.baseUrl, globalConfig.userToken);
                previewDiv.innerHTML = renderedHtml;
                
bindInteractiveElements(previewDiv);
            } else {
                markdownShortcuts.classList.remove('hidden');
            }
        });
    });
    
    initMarkdownShortcuts();
}

document.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    hasMoved = false;
}, {passive: true});

document.addEventListener('touchmove', function(e) {
    if (!hasMoved) {
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);

        if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
            hasMoved = true;
        }
    }
}, {passive: true});


function initComments(config) {
    const baseUrl = config[0] || '';
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
    
    initFabMenu();
    initImageViewer();
    initInputPanel();

    if (baseUrl && bookId) {
        getReview(baseUrl, bookName, chapterName, bookId, chapterId, detailUrl, coverUrl, userToken);

        const headerBox = document.getElementById('headerBox');
        headerBox.addEventListener('click', (e) => {
            if (e.target.id !== 'coverImage') {
                toggleCover(coverUrl);
            }
        });
        headerBox.style.cursor = 'pointer';
    } else {
        document.getElementById('commentsList').innerHTML = '<div class="error">缺少必要参数</div>';
    }
}