/**
 * 维基百科 - 主应用逻辑
 * 功能：全页面编辑、数据库集成、照片上传、界面交互
 */

// ==================== 配置 ====================
const CONFIG = {
    supabaseUrl: 'https://vaovjekycimgbvupzzns.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhb3ZqZWt5Y2ltZ2J2dXB6em5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTk5OTMsImV4cCI6MjA5ODI5NTk5M30.2m9lwhN6oHfrumshKlILYdzt3TNDEqlqKCQWsuYrhmg',
    defaultArticleId: 'elon-musk'
};

// ==================== Supabase 初始化 ====================
let supabaseClient = null;

function initSupabase() {
    if (CONFIG.supabaseKey) {
        try {
            supabaseClient = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
            console.log('Supabase 客户端初始化成功');
        } catch (e) {
            console.warn('Supabase 初始化失败，将使用本地存储:', e.message);
        }
    }
}

// ==================== 数据管理 ====================
class ArticleManager {
    constructor() {
        this.currentArticle = null;
        this.originalContent = '';
        this.originalPhotoDataUrl = '';
    }

    // 保存文章全量快照
    snapshotPage() {
        return {
            title: document.getElementById('pageTitle').textContent.trim(),
            subtitle: document.querySelector('[data-editable="redirect"]')?.innerHTML || '',
            paragraphs: Array.from(document.querySelectorAll('[data-editable="paragraph"]')).map(p => p.innerHTML),
            headings: Array.from(document.querySelectorAll('[data-editable="heading"]')).map(h => h.textContent.trim()),
            infoboxCaption: document.querySelector('.infobox-table caption')?.innerHTML || '',
            infoboxCaptionText: document.querySelector('[data-editable="infobox-caption-text"]')?.innerHTML || '',
            infoboxSection: document.querySelector('[data-editable="infobox-section"]')?.textContent.trim() || '',
            infoboxLabels: Array.from(document.querySelectorAll('[data-editable="infobox-label"]')).map(th => th.textContent.trim()),
            infoboxValues: Array.from(document.querySelectorAll('[data-editable="infobox-value"]')).map(td => td.innerHTML),
            infoboxFields: Array.from(document.querySelectorAll('[data-editable="infobox-value"]')).map(td => td.getAttribute('data-field') || ''),
            photoUrl: document.getElementById('infoboxPhoto')?.src || '',
            notes: Array.from(document.querySelectorAll('[data-editable="list-item"]')).map(li => li.innerHTML),
            categories: document.querySelector('.categories')?.innerHTML || '',
            lastEdited: document.getElementById('lastEdited')?.textContent || ''
        };
    }

    // 恢复页面快照
    restoreSnapshot(snapshot) {
        if (!snapshot || !snapshot.title) return;

        document.getElementById('pageTitle').textContent = snapshot.title;

        const subtitle = document.querySelector('[data-editable="redirect"]');
        if (subtitle && snapshot.subtitle) subtitle.innerHTML = snapshot.subtitle;

        const paragraphs = document.querySelectorAll('[data-editable="paragraph"]');
        if (snapshot.paragraphs) {
            snapshot.paragraphs.forEach((html, i) => {
                if (paragraphs[i]) paragraphs[i].innerHTML = html;
            });
        }

        if (snapshot.photoUrl) {
            const img = document.getElementById('infoboxPhoto');
            if (img) img.src = snapshot.photoUrl;
        }

        if (snapshot.infoboxCaption) {
            const cap = document.querySelector('.infobox-table caption');
            if (cap) cap.innerHTML = snapshot.infoboxCaption;
        }

        if (snapshot.infoboxCaptionText) {
            const capText = document.querySelector('[data-editable="infobox-caption-text"]');
            if (capText) capText.innerHTML = snapshot.infoboxCaptionText;
        }

        if (snapshot.infoboxSection) {
            const sec = document.querySelector('[data-editable="infobox-section"]');
            if (sec) sec.textContent = snapshot.infoboxSection;
        }

        if (snapshot.infoboxValues) {
            const values = document.querySelectorAll('[data-editable="infobox-value"]');
            snapshot.infoboxValues.forEach((html, i) => {
                if (values[i]) values[i].innerHTML = html;
            });
        }

        document.getElementById('lastEdited').textContent = snapshot.lastEdited || '最后编辑于 刚刚';
    }

    // 获取文章数据
    async getArticle(articleId) {
        showLoading(true);
        try {
            if (supabaseClient) {
                const { data, error } = await supabaseClient
                    .from('wiki_articles')
                    .select('*')
                    .eq('id', articleId)
                    .single();

                if (error && error.code !== 'PGRST116') throw error;

                if (data && data.content) {
                    this.currentArticle = data;
                    this.originalContent = JSON.stringify(data.content);
                    // 恢复保存的内容
                    if (data.content.snapshot) {
                        this.restoreSnapshot(data.content.snapshot);
                    }
                    showLoading(false);
                    return data;
                }
            }

            // Fallback: localStorage
            const localData = localStorage.getItem(`wiki_${articleId}`);
            if (localData) {
                const parsed = JSON.parse(localData);
                this.currentArticle = parsed;
                this.originalContent = JSON.stringify(parsed.content);
                if (parsed.content && parsed.content.snapshot) {
                    this.restoreSnapshot(parsed.content.snapshot);
                }
                showLoading(false);
                return parsed;
            }
        } catch (error) {
            console.error('获取文章失败:', error);
        }

        // 使用默认页面（页面上已有的内容）
        this.currentArticle = {
            id: articleId,
            title: document.getElementById('pageTitle').textContent,
            content: { snapshot: this.snapshotPage() }
        };
        this.originalContent = JSON.stringify(this.currentArticle.content);
        showLoading(false);
        return this.currentArticle;
    }

    // 保存文章
    async saveArticle() {
        showLoading(true);

        const snapshot = this.snapshotPage();
        const now = new Date();
        snapshot.lastEdited = '最后编辑于 ' + now.toLocaleString('zh-CN');

        const articleData = {
            id: CONFIG.defaultArticleId,
            title: snapshot.title,
            content: { snapshot: snapshot },
            updated_at: now.toISOString()
        };

        try {
            if (supabaseClient) {
                const { error } = await supabaseClient
                    .from('wiki_articles')
                    .upsert(articleData, { onConflict: 'id' });

                if (error) throw error;

                document.getElementById('lastEdited').textContent = snapshot.lastEdited;
                showNotification('✅ 文章已保存到云端', 'success');
                this.originalContent = JSON.stringify(articleData.content);
                showLoading(false);
                return true;
            } else {
                localStorage.setItem(`wiki_${CONFIG.defaultArticleId}`, JSON.stringify({
                    ...articleData,
                    created_at: now.toISOString()
                }));

                document.getElementById('lastEdited').textContent = snapshot.lastEdited;
                showNotification('💾 文章已保存（本地模式）', 'success');
                this.originalContent = JSON.stringify(articleData.content);
                showLoading(false);
                return true;
            }
        } catch (error) {
            console.error('保存失败:', error);
            showNotification('❌ 保存失败: ' + error.message, 'error');
            showLoading(false);
            return false;
        }
    }
}

const articleManager = new ArticleManager();

// ==================== 编辑功能 ====================
let isEditMode = false;
let pendingPhotoDataUrl = null;

function enableEditMode() {
    isEditMode = true;
    pendingPhotoDataUrl = null;

    // 1. 启用页面标题编辑
    const title = document.getElementById('pageTitle');
    title.setAttribute('contenteditable', 'true');
    title.focus();

    // 2. 启用副标题编辑
    const subtitle = document.querySelector('[data-editable="redirect"]');
    if (subtitle) subtitle.setAttribute('contenteditable', 'true');

    // 3. 启用所有段落编辑
    document.querySelectorAll('[data-editable="paragraph"]').forEach(p => {
        p.setAttribute('contenteditable', 'true');
    });

    // 4. 启用所有标题编辑
    document.querySelectorAll('[data-editable="heading"]').forEach(h => {
        h.setAttribute('contenteditable', 'true');
        h.style.outline = '2px dashed #3366cc';
        h.style.outlineOffset = '3px';
        h.style.background = '#fffbf0';
        h.style.borderRadius = '3px';
    });

    // 5. 启用 Infobox 编辑
    const infobox = document.getElementById('infobox');
    infobox.classList.add('editing-mode');
    document.querySelectorAll('[data-editable="infobox-caption"]').forEach(el => el.setAttribute('contenteditable', 'true'));
    document.querySelectorAll('[data-editable="infobox-caption-text"]').forEach(el => el.setAttribute('contenteditable', 'true'));
    document.querySelectorAll('[data-editable="infobox-section"]').forEach(el => el.setAttribute('contenteditable', 'true'));
    document.querySelectorAll('[data-editable="infobox-label"]').forEach(el => el.setAttribute('contenteditable', 'true'));
    document.querySelectorAll('[data-editable="infobox-value"]').forEach(el => el.setAttribute('contenteditable', 'true'));

    // 6. 显示照片上传提示
    document.getElementById('photoUploadHint').style.display = 'block';
    document.getElementById('imageWrapper').onclick = function() { document.getElementById('photoFileInput').click(); };

    // 7. 启用列表项编辑
    document.querySelectorAll('[data-editable="list-item"]').forEach(el => el.setAttribute('contenteditable', 'true'));
    document.querySelectorAll('[data-editable="block"]').forEach(el => {
        el.style.outline = '2px dashed #3366cc';
        el.style.outlineOffset = '3px';
    });

    // 8. 显示保存/取消按钮
    document.getElementById('editActions').style.display = 'flex';

    // 9. 更新编辑按钮状态
    const editBtn = document.querySelector('.edit-button');
    editBtn.textContent = '📝 编辑中...';
    editBtn.style.background = '#d4edda';
    editBtn.style.borderColor = '#28a745';

    showNotification('✏️ 编辑模式：所有内容（标题、正文、信息栏、图片）均可修改', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showNotification('⚠️ 请选择图片文件', 'error');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showNotification('⚠️ 图片不能超过 10MB', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        pendingPhotoDataUrl = e.target.result;
        document.getElementById('infoboxPhoto').src = pendingPhotoDataUrl;
        showNotification('📷 照片已更新，保存后生效', 'success');
    };
    reader.onerror = function() {
        showNotification('❌ 图片读取失败', 'error');
    };
    reader.readAsDataURL(file);
}

async function saveContent() {
    if (!isEditMode) return;

    // 如果有待上传的照片，先存入快照
    if (pendingPhotoDataUrl) {
        const img = document.getElementById('infoboxPhoto');
        img.src = pendingPhotoDataUrl;
    }

    const success = await articleManager.saveArticle();
    if (success) {
        exitEditMode();
    }
}

function cancelEdit() {
    if (confirm('确定要放弃所有更改吗？')) {
        location.reload();
    } else {
        exitEditMode();
    }
}

function exitEditMode() {
    isEditMode = false;

    // 1. 禁用标题编辑
    const title = document.getElementById('pageTitle');
    title.setAttribute('contenteditable', 'false');

    // 2. 禁用副标题编辑
    const subtitle = document.querySelector('[data-editable="redirect"]');
    if (subtitle) subtitle.setAttribute('contenteditable', 'false');

    // 3. 禁用段落编辑
    document.querySelectorAll('[data-editable="paragraph"]').forEach(p => {
        p.setAttribute('contenteditable', 'false');
    });

    // 4. 禁用标题编辑并移除样式
    document.querySelectorAll('[data-editable="heading"]').forEach(h => {
        h.setAttribute('contenteditable', 'false');
        h.style.outline = '';
        h.style.outlineOffset = '';
        h.style.background = '';
        h.style.borderRadius = '';
    });

    // 5. 禁用 Infobox
    document.getElementById('infobox').classList.remove('editing-mode');
    document.querySelectorAll('.infobox [contenteditable="true"]').forEach(el => el.setAttribute('contenteditable', 'false'));

    // 6. 隐藏照片上传提示
    document.getElementById('photoUploadHint').style.display = 'none';
    document.getElementById('imageWrapper').onclick = null;

    // 7. 禁用列表项
    document.querySelectorAll('[data-editable="list-item"]').forEach(el => el.setAttribute('contenteditable', 'false'));
    document.querySelectorAll('[data-editable="block"]').forEach(el => {
        el.style.outline = '';
        el.style.outlineOffset = '';
    });

    // 8. 隐藏保存按钮
    document.getElementById('editActions').style.display = 'none';

    // 9. 恢复编辑按钮
    const editBtn = document.querySelector('.edit-button');
    editBtn.textContent = '✏️ 编辑';
    editBtn.style.background = '';
    editBtn.style.borderColor = '';

    pendingPhotoDataUrl = null;
}

function editSection(sectionId) {
    event.preventDefault();
    enableEditMode();
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ==================== 目录导航 ====================
function toggleTOC() {
    const sidebar = document.getElementById('tocSidebar');
    const btn = document.querySelector('.toggle-toc');

    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('active');
        if (sidebar.classList.contains('active')) {
            btn.textContent = '关闭';
            addOverlay();
        } else {
            btn.textContent = '隐藏';
            removeOverlay();
        }
    } else {
        const list = document.getElementById('tocList');
        const isHidden = list.style.display === 'none';
        list.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? '隐藏' : '显示';
    }
}

function addOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'toc-overlay';
    overlay.onclick = () => toggleTOC();
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 7999;
    `;
    document.body.appendChild(overlay);
}

function removeOverlay() {
    const overlay = document.querySelector('.toc-overlay');
    if (overlay) overlay.remove();
}

// 平滑滚动到锚点
document.addEventListener('click', function(e) {
    const link = e.target.closest('.toc-list a');
    if (link) {
        e.preventDefault();
        const targetId = link.getAttribute('href');
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            highlightSection(targetElement);
            if (window.innerWidth <= 768 && document.getElementById('tocSidebar').classList.contains('active')) {
                toggleTOC();
            }
        }
    }
});

function highlightSection(element) {
    element.style.background = 'rgba(51,102,204,0.1)';
    setTimeout(() => { element.style.background = ''; }, 1500);
}

// ==================== 外观设置 ====================
function changeFontSize(size) {
    const contentBody = document.querySelector('.content-body');
    switch(size) {
        case 'small': contentBody.style.fontSize = '13px'; break;
        case 'standard': contentBody.style.fontSize = '14px'; break;
        case 'large': contentBody.style.fontSize = '16px'; break;
    }
    savePreference('fontSize', size);
}

function changeWidth(width) {
    const container = document.querySelector('.main-container');
    container.style.maxWidth = width === 'wide' ? '95%' : '1400px';
    savePreference('width', width);
}

function changeTheme(theme) {
    if (theme === 'auto') {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', theme);
    }
    savePreference('theme', theme);
}

function savePreference(key, value) {
    localStorage.setItem(`wiki_pref_${key}`, value);
}

function loadPreferences() {
    const fontSize = localStorage.getItem('wiki_pref_fontSize') || 'standard';
    const width = localStorage.getItem('wiki_pref_width') || 'standard';
    const theme = localStorage.getItem('wiki_pref_theme') || 'light';
    changeFontSize(fontSize);
    changeWidth(width);
    changeTheme(theme);
    document.querySelectorAll(`input[name="fontSize"][value="${fontSize}"]`)[0]?.setAttribute('checked', '');
    document.querySelectorAll(`input[name="width"][value="${width}"]`)[0]?.setAttribute('checked', '');
    document.querySelectorAll(`input[name="theme"][value="${theme}"]`)[0]?.setAttribute('checked', '');
}

// ==================== 工具函数 ====================
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function showNotification(message, type = '') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    setTimeout(() => { notification.style.display = 'none'; }, 3000);
}

function openDiscussion() {
    showNotification('📝 讨论功能开发中...', 'success');
    return false;
}

function viewSource() {
    const source = document.documentElement.outerHTML;
    const newWindow = window.open('', '_blank');
    newWindow.document.write(`<pre style="white-space:pre-wrap;word-wrap:break-word;padding:20px;font-family:monospace;font-size:12px;">${escapeHtml(source)}</pre>`);
    newWindow.document.close();
    return false;
}

function toggleReadMode() {
    showNotification('📖 阅读模式已切换', 'success');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 搜索功能 ====================
document.querySelector('.search-box').addEventListener('submit', function(e) {
    e.preventDefault();
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        showNotification('搜索功能开发中，请使用浏览器查找 (Ctrl+F)', 'error');
    }
});

// ==================== 关闭通知栏 ====================
document.querySelector('.close-notice').addEventListener('click', function() {
    document.querySelector('.site-notice').style.display = 'none';
    savePreference('noticeHidden', 'true');
});

// ==================== 键盘快捷键 ====================
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isEditMode) saveContent();
    }
    if (e.key === 'Escape') {
        if (isEditMode && confirm('退出编辑模式？')) cancelEdit();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        if (!isEditMode) enableEditMode();
    }
});

// ==================== 页面初始化 ====================
async function initApp() {
    console.log('维基百科 - 初始化中...');
    showLoading(true);
    try {
        initSupabase();
        loadPreferences();
        await articleManager.getArticle(CONFIG.defaultArticleId);
        if (localStorage.getItem('wiki_pref_noticeHidden') === 'true') {
            document.querySelector('.site-notice').style.display = 'none';
        }
        if (window.innerWidth <= 768) addMobileTOCButton();
        showLoading(false);
        console.log('维基百科 - 初始化完成 ✅');
    } catch (error) {
        console.error('初始化失败:', error);
        showLoading(false);
        showNotification('⚠️ 部分功能加载失败，但不影响基本使用', 'error');
    }
}

function addMobileTOCButton() {
    const btn = document.createElement('button');
    btn.className = 'mobile-toc-btn';
    btn.innerHTML = '📑 目录';
    btn.style.cssText = `
        position: fixed; bottom: 140px; right: 15px;
        background: #3366cc; color: white; border: none;
        border-radius: 50%; width: 48px; height: 48px;
        font-size: 18px; cursor: pointer;
        box-shadow: 0 3px 10px rgba(0,0,0,0.3); z-index: 9998;
    `;
    btn.onclick = () => toggleTOC();
    document.body.appendChild(btn);
    const mq = window.matchMedia('(max-width: 768px)');
    btn.style.display = mq.matches ? 'block' : 'none';
    mq.addListener((e) => { btn.style.display = e.matches ? 'block' : 'none'; });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
