/**
 * 伪维基百科 - 主应用逻辑
 * 功能：编辑内容、数据库集成、二维码生成、界面交互
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
// 文章数据模型
class ArticleManager {
    constructor() {
        this.currentArticle = null;
        this.isDirty = false;
        this.originalContent = '';
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

                if (error) throw error;

                this.currentArticle = data;
                this.originalContent = JSON.stringify(data.content);
                showLoading(false);
                return data;
            } else {
                // 使用 localStorage 作为后备
                const localData = localStorage.getItem(`wiki_${articleId}`);
                const article = localData ? JSON.parse(localData) : this.getDefaultArticle();
                this.currentArticle = article;
                this.originalContent = JSON.stringify(article.content);
                showLoading(false);
                return article;
            }
        } catch (error) {
            console.error('获取文章失败:', error);
            showLoading(false);

            // 返回默认文章
            const defaultArticle = this.getDefaultArticle();
            this.currentArticle = defaultArticle;
            return defaultArticle;
        }
    }

    // 保存文章
    async saveArticle(content) {
        showLoading(true);

        const articleData = {
            id: CONFIG.defaultArticleId,
            title: document.getElementById('pageTitle').textContent,
            content: content,
            updated_at: new Date().toISOString()
        };

        try {
            if (supabaseClient) {
                const { data, error } = await supabaseClient
                    .from('wiki_articles')
                    .upsert(articleData, { onConflict: 'id' });

                if (error) throw error;

                showNotification('✅ 文章已保存到云端', 'success');
                this.isDirty = false;
                this.originalContent = JSON.stringify(content);
                showLoading(false);
                return true;
            } else {
                // 保存到 localStorage
                localStorage.setItem(`wiki_${CONFIG.defaultArticleId}`, JSON.stringify({
                    ...articleData,
                    created_at: new Date().toISOString()
                }));

                showNotification('💾 文章已保存（本地模式）', 'success');
                this.isDirty = false;
                this.originalContent = JSON.stringify(content);
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

    // 默认文章数据
    getDefaultArticle() {
        return {
            id: CONFIG.defaultArticleId,
            title: '埃隆·马斯克',
            created_at: new Date().toISOString(),
            content: {}
        };
    }
}

const articleManager = new ArticleManager();

// ==================== 编辑功能 ====================
let isEditMode = false;

function enableEditMode() {
    isEditMode = true;

    // 使所有段落可编辑
    const paragraphs = document.querySelectorAll('#contentBody p[contenteditable="false"]');
    paragraphs.forEach(p => p.setAttribute('contenteditable', 'true'));

    // 显示保存/取消按钮
    document.getElementById('editActions').style.display = 'flex';

    // 更新编辑按钮状态
    const editBtn = document.querySelector('.edit-button');
    editBtn.textContent = '📝 编辑中...';
    editBtn.style.background = '#d4edda';
    editBtn.style.borderColor = '#28a745';

    showNotification('✏️ 已进入编辑模式，点击文本即可修改', 'success');

    // 滚动到顶部方便编辑
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveContent() {
    if (!isEditMode) return;

    // 收集所有可编辑内容
    const editableElements = document.querySelectorAll('#contentBody [contenteditable="true"]');
    const content = {};

    editableElements.forEach((el, index) => {
        content[`paragraph_${index}`] = {
            html: el.innerHTML,
            text: el.textContent
        };
    });

    // 保存到数据库/存储
    const success = await articleManager.saveArticle(content);

    if (success) {
        exitEditMode();
    }
}

function cancelEdit() {
    // 可选：恢复原始内容
    if (confirm('确定要放弃所有更改吗？')) {
        location.reload();
    } else {
        exitEditMode();
    }
}

function exitEditMode() {
    isEditMode = false;

    // 禁用所有段落的编辑状态
    const paragraphs = document.querySelectorAll('#contentBody [contenteditable="true"]');
    paragraphs.forEach(p => p.setAttribute('contenteditable', 'false'));

    // 隐藏保存/取消按钮
    document.getElementById('editActions').style.display = 'none';

    // 恢复编辑按钮
    const editBtn = document.querySelector('.edit-button');
    editBtn.textContent = '✏️ 编辑';
    editBtn.style.background = '';
    editBtn.style.borderColor = '';
}

function editSection(sectionId) {
    event.preventDefault();
    enableEditMode();
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // 找到该section后的第一个可编辑元素并聚焦
        const nextEditable = section.nextElementSibling?.querySelector('[contenteditable="true"]') ||
                           section.parentElement?.nextElementSibling?.querySelector('[contenteditable="true"]');
        if (nextEditable) {
            nextEditable.focus();
        }
    }
}

// ==================== 二维码功能 ====================
let qrCodeInstance = null;

function toggleQRCode() {
    const modal = document.getElementById('qrModal');
    const isVisible = modal.style.display !== 'none';

    if (isVisible) {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'flex';
        generateQRCode();
    }
}

function generateQRCode() {
    const container = document.getElementById('qrCodeContainer');
    container.innerHTML = ''; // 清空之前的二维码

    // 获取当前页面URL（优先使用实际部署URL）
    let pageUrl = window.location.href;

    // 如果是localhost或IP地址，尝试使用更友好的提示
    if (pageUrl.includes('localhost') || pageUrl.includes('127.0.0.1')) {
        pageUrl = window.location.origin + window.location.pathname;
    }

    // 生成QRCode
    QRCode.toCanvas(pageUrl, {
        width: 220,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        },
        errorCorrectionLevel: 'H'
    }, function(error, canvas) {
        if (error) {
            console.error('QRCode生成失败:', error);
            container.innerHTML = '<p style="color:red;">二维码生成失败</p>';
            return;
        }
        canvas.id = 'qrcodeCanvas';
        container.appendChild(canvas);
    });
}

// ==================== 目录导航 ====================
function toggleTOC() {
    const sidebar = document.getElementById('tocSidebar');
    const btn = document.querySelector('.toggle-toc');

    // 移动端：侧滑显示
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('active');
        if (sidebar.classList.contains('active')) {
            btn.textContent = '关闭';
            // 添加遮罩层
            addOverlay();
        } else {
            btn.textContent = '隐藏';
            removeOverlay();
        }
    } else {
        // 桌面端：折叠/展开
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
            // 高亮目标章节
            highlightSection(targetElement);

            // 移动端自动关闭目录
            if (window.innerWidth <= 768 && document.getElementById('tocSidebar').classList.contains('active')) {
                toggleTOC();
            }
        }
    }
});

function highlightSection(element) {
    element.style.background = 'rgba(51,102,204,0.1)';
    setTimeout(() => {
        element.style.background = '';
    }, 1500);
}

// ==================== 外观设置 ====================
function changeFontSize(size) {
    const body = document.body;
    body.classList.remove('font-small', 'font-standard', 'font-large');
    body.classList.add(`font-${size}`);

    switch(size) {
        case 'small':
            document.querySelector('.content-body').style.fontSize = '13px';
            break;
        case 'standard':
            document.querySelector('.content-body').style.fontSize = '14px';
            break;
        case 'large':
            document.querySelector('.content-body').style.fontSize = '16px';
            break;
    }
    savePreference('fontSize', size);
}

function changeWidth(width) {
    const container = document.querySelector('.main-container');
    container.classList.remove('width-standard', 'width-wide');
    container.classList.add(`width-${width}`);

    switch(width) {
        case 'standard':
            container.style.maxWidth = '1400px';
            break;
        case 'wide':
            container.style.maxWidth = '95%';
            break;
    }
    savePreference('width', width);
}

function changeTheme(theme) {
    const body = document.body;

    if (theme === 'auto') {
        body.removeAttribute('data-theme');
        body.classList.add('theme-auto');
    } else {
        body.setAttribute('data-theme', theme);
        body.classList.remove('theme-auto');
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

    // 应用保存的设置
    changeFontSize(fontSize);
    changeWidth(width);
    changeTheme(theme);

    // 更新UI选中状态
    document.querySelectorAll(`input[name="fontSize"][value="${fontSize}"]`)[0]?.setAttribute('checked', '');
    document.querySelectorAll(`input[name="width"][value="${width}"]`)[0]?.setAttribute('checked', '');
    document.querySelectorAll(`input[name="theme"][value="${theme}"]`)[0]?.setAttribute('checked', '');
}

// ==================== 工具函数 ====================
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
}

function showNotification(message, type = '') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';

    // 3秒后自动消失
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

function openDiscussion() {
    showNotification('📝 讨论功能开发中...', 'success');
    return false;
}

function viewSource() {
    // 显示HTML源代码
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
        showNotification(`🔍 正在搜索: "${query}"`, 'success');
        // 这里可以添加实际的搜索逻辑
        setTimeout(() => {
            showNotification('搜索功能开发中，请使用浏览器查找(Ctrl+F)', 'error');
        }, 500);
    }
});

// ==================== 关闭通知栏 ================= */
document.querySelector('.close-notice').addEventListener('click', function() {
    document.querySelector('.site-notice').style.display = 'none';
    savePreference('noticeHidden', 'true');
});

// ==================== 键盘快捷键 ====================
document.addEventListener('keydown', function(e) {
    // Ctrl+S 或 Cmd+S 保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isEditMode) {
            saveContent();
        }
    }

    // Esc 退出编辑或关闭弹窗
    if (e.key === 'Escape') {
        if (document.getElementById('qrModal').style.display !== 'none') {
            toggleQRCode();
        }
        if (isEditMode && confirm('退出编辑模式？')) {
            cancelEdit();
        }
    }

    // Ctrl+E 进入编辑模式
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        if (!isEditMode) {
            enableEditMode();
        }
    }
});

// ==================== 页面初始化 ====================
async function initApp() {
    console.log('伪维基百科 - 初始化中...');
    showLoading(true);

    try {
        // 1. 初始化 Supabase
        initSupabase();

        // 2. 加载用户偏好设置
        loadPreferences();

        // 3. 加载文章内容
        await articleManager.getArticle(CONFIG.defaultArticleId);

        // 4. 检查通知栏是否应该显示
        if (localStorage.getItem('wiki_pref_noticeHidden') === 'true') {
            document.querySelector('.site-notice').style.display = 'none';
        }

        // 5. 添加移动端目录按钮
        if (window.innerWidth <= 768) {
            addMobileTOCButton();
        }

        showLoading(false);
        console.log('伪维基百科 - 初始化完成 ✅');
    } catch (error) {
        console.error('初始化失败:', error);
        showLoading(false);
        showNotification('⚠️ 部分功能加载失败，但不影响基本使用', 'error');
    }
}

// 移动端目录按钮
function addMobileTOCButton() {
    const btn = document.createElement('button');
    btn.className = 'mobile-toc-btn';
    btn.innerHTML = '📑 目录';
    btn.style.cssText = `
        display: none !important;
        position: fixed;
        bottom: 140px;
        right: 15px;
        background: #3366cc;
        color: white;
        border: none;
        border-radius: 50%;
        width: 48px;
        height: 48px;
        font-size: 18px;
        cursor: pointer;
        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        z-index: 9998;
    `;
    btn.onclick = () => toggleTOC();
    document.body.appendChild(btn);

    // 在小屏幕上显示
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    btn.style.display = mediaQuery.matches ? 'block' : 'none';
    mediaQuery.addListener((mq) => {
        btn.style.display = mq.matches ? 'block' : 'none';
    });
}

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
