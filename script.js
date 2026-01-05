marked.setOptions({breaks: true, gfm: true});

let pressTimer = null;
let startTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let hasMoved = false;

const MOVE_THRESHOLD = 15;
const PRESS_DURATION = 500;
const bookCache = new Map();

const formatNumber = n => n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : n.toLocaleString();

function createAuthHeaders(userToken) {
    const headers = {};
    if (userToken) {
        headers['Authorization'] = userToken;
    }
    return headers;
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

function processFoldTags(text) {
    return text.replace(/\[fold:([^\]]+)\]([\s\S]*?)\[\/fold\]/g, (match, title, content) => {
        const foldId = 'fold_' + Math.random().toString(36).substr(2, 9);
        return `<div class="fold-container">
            <div class="fold-header" data-fold="${foldId}">${title}</div>
            <div class="fold-content" id="${foldId}">${marked.parse(processSpoiler(content.trim()))}</div>
        </div>`;
    });
}

async function renderMarkdown(text, baseUrl, userToken) {
    const processedBookTagsText = await processBookTags(text, baseUrl, userToken);
    const processedSpoilerText = processSpoiler(processedBookTagsText);
    const processedFoldText = processFoldTags(processedSpoilerText);
    return marked.parse(processedFoldText);
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
                    ${statsHtml}
                </div>
                ${badgesHtml}
                <div class="reply-content">${contentHtml}</div>
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
                    ${statsHtml}
                </div>
                ${badgesHtml}
                <div class="comment-content">${contentHtml}</div>
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

document.addEventListener('touchstart', function(e) {
    const target = e.target;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    hasMoved = false;

    if (target.classList.contains('replies-toggle-btn') || target.closest('.replies-toggle-btn')) {
        return;
    }

    if (target.dataset.fold) {
        return;
    }

    if (target.dataset.spoiler && !target.classList.contains('revealed')) {
        startTime = Date.now();
        pressTimer = setTimeout(() => {
            if (!hasMoved) {
                target.classList.add('temp-show');
            }
        }, PRESS_DURATION);
    }
}, {passive: true});

document.addEventListener('touchmove', function(e) {
    const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
    const deltaY = Math.abs(e.touches[0].clientY - touchStartY);

    if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
        hasMoved = true;
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }

        const target = e.target;
        if (target.dataset.spoiler) {
            target.classList.remove('temp-show');
        }
    }
}, {passive: true});

document.addEventListener('touchend', function(e) {
    const target = e.target;

    const toggleBtn = target.classList.contains('replies-toggle-btn') ? target : target.closest('.replies-toggle-btn');
    if (toggleBtn && !hasMoved) {
        const repliesContainer = document.getElementById(toggleBtn.dataset.replies);
        if (repliesContainer) {
            toggleBtn.classList.toggle('expanded');
            repliesContainer.classList.toggle('expanded');
        }
    }

    const foldHeader = target.dataset.fold ? target : target.closest('.fold-header');
    if (foldHeader && !hasMoved) {
        const foldContent = document.getElementById(foldHeader.dataset.fold);
        const header = foldContent.previousElementSibling;

        if (foldContent.classList.contains('expanded')) {
            foldContent.classList.remove('expanded');
            header.classList.remove('expanded');
        } else {
            foldContent.classList.add('expanded');
            header.classList.add('expanded');
        }
    }

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
}, {passive: false});

function initComments(config) {
    const baseUrl = config[0] || '';
    const bookName = config[1] || '未知书籍';
    const bookId = config[2] || '';
    const chapterName = config[3] || '';
    const chapterId = config[4] || '';
    const detailUrl = config[5] || '#';
    const coverUrl = config[6] || '';
    const userToken = config[7] || '';

    document.getElementById('commentBtn').href = detailUrl;

    if (baseUrl && bookId) {
        getReview(baseUrl, bookName, chapterName, bookId, chapterId, detailUrl, coverUrl, userToken);

        const headerBox = document.getElementById('headerBox');
        headerBox.addEventListener('click', () => toggleCover(coverUrl));
        headerBox.style.cursor = 'pointer';
    } else {
        document.getElementById('commentsList').innerHTML = '<div class="error">缺少必要参数</div>';
    }
}