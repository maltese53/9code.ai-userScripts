// ==UserScript==
// @name         Carousell 廣告篩選器
// @namespace    http://tampermonkey.net/
// @version      1.1 (Safari/Pro)
// @description  制裁收買佬廣告阻住我買AP Watch
// @author       9code.ai
// @match        https://www.carousell.com.hk/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- 設定 ---

    // 預設的過濾詞列表
    const defaultBannedWords = [
        '高價', '收購', '回收', '徵收', '收酒',
        '上門回收', '收', '鑑定', '報價', '上門',
        '高價回收', '高價求','各種','名牌錶','名牌手錶','購買','二手音響設備','音響HiFi ','新舊手錶','實體','免費上門'
    ];

    // 用於獲取【商品列表項】動態 class name 的 XPath 陣列
    const DESKTOP_ITEM_XPATH = '/html/body/div[1]/div/main/div[2]/div/section[2]/div[1]/div/div[2]/div/div[1]';
    const MOBILE_ITEM_XPATH = '/html/body/div[1]/div/main/div/div[1]/div[4]/div[1]';
    const ITEM_XPATHS = [DESKTOP_ITEM_XPATH, MOBILE_ITEM_XPATH];

    // 用於獲取【廣告/推廣項】動態 class name 的 XPath
    const AD_XPATH = '/html/body/div[1]/div/main/div/div[1]/div[4]/div[29]/div/div';


    // --- 全域變數 ---
    const STORAGE_KEY = 'carousellFilterWords_v2'; // localStorage Key
    let managedFilterWords = [];
    let itemClassSelector = null; // 2. 移除：不再使用 Fallback
    let adClassSelector = null;

    /**
     * 注入 UI 的 HTML 結構
     */
    function injectUI() {
        const uiContainer = document.createElement('div');
        uiContainer.id = 'filter-ui-container';
        uiContainer.innerHTML = `
            <div id="filter-toggle-btn" title="切換過濾器面板">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="m15 18-6-6 6-6"/></svg>
            </div>
            <div id="filter-panel">
                <div class="panel-header">管理過濾詞彙</div>
                <div class="add-section">
                    <input type="text" id="filter-add-input" placeholder="輸入要過濾的詞...">
                    <button id="filter-add-btn">確定</button>
                </div>
                <div id="filter-word-list" class="scrolling-menu">
                    <!-- 過濾詞彙會動態插入到這裡 -->
                </div>
            </div>
        `;
        document.body.appendChild(uiContainer);
    }

    /**
     * 注入 UI 的 CSS 樣式
     */
    function injectStyles() {
        const PRIMARY_COLOR = '#e74c3c'; // 主紅色
        const PRIMARY_COLOR_DARK = '#c0392b'; // 深紅色 (Hover)
        const PANEL_WIDTH = '320px'; // 4. 修改：面板寬度改為 320px

        const styleElement = document.createElement('style');
        styleElement.type = 'text/css';
        styleElement.innerHTML = `
            #filter-ui-container {
                position: fixed;
                top: 50%;
                right: 0;
                transform: translateY(-50%) translateX(${PANEL_WIDTH});
                z-index: 9999;
                font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
                display: flex;
                align-items: center;
                transition: transform 0.3s ease-out;
            }

            #filter-ui-container.is-expanded {
                transform: translateY(-50%) translateX(0);
            }

            #filter-toggle-btn {
                position: relative;
                order: 1;
                background-color: ${PRIMARY_COLOR};
                color: white;
                padding: 16px 8px 16px 10px;
                border-radius: 256px 0 0 256px;
                cursor: pointer;
                box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
            }

            #filter-toggle-btn:hover {
                box-shadow: 0 6px 12px rgba(0,0,0,0.2);
            }

            #filter-toggle-btn svg {
                transition: transform 0.3s ease-out;
            }

            #filter-ui-container.is-expanded #filter-toggle-btn svg {
                transform: rotate(180deg);
            }

            #filter-panel {
                width: ${PANEL_WIDTH};
                height: 400px;
                background-color: #f9f9f9;
                border: 1px solid #ccc;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: flex;
                flex-direction: column;
                order: 2;
            }

            .panel-header {
                font-size: 16px;
                font-weight: bold;
                padding: 12px;
                background-color: ${PRIMARY_COLOR};
                color: white;
                border-bottom: 1px solid #ddd;
                text-align: center;
                border-top-right-radius: 8px;
                border-top-left-radius: 8px; /* 3. 修改：新增左上圓角 */
            }

            .add-section {
                display: flex;
                padding: 10px;
                border-bottom: 1px solid #ddd;
            }

            #filter-add-input {
                flex-grow: 1;
                border: 1px solid #ccc;
                border-radius: 4px;
                padding: 8px;
                font-size: 16px; /* 1. 修改：防止 iPhone 縮放 */
                margin-right: 5px;
            }
            #filter-add-input:focus {
                border-color: ${PRIMARY_COLOR};
                box-shadow: 0 0 0 2px ${PRIMARY_COLOR}33;
                outline: none;
            }

            #filter-add-btn {
                padding: 8px 12px;
                font-size: 16px; /* 1. 修改：與輸入框一致 */
                background-color: ${PRIMARY_COLOR};
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
            }

            #filter-add-btn:hover {
                background-color: ${PRIMARY_COLOR_DARK};
            }

            .scrolling-menu {
                flex-grow: 1;
                overflow-y: auto;
                padding: 10px;
            }

            .filter-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 5px;
                border-bottom: 1px solid #eee;
                font-size: 16px; /* 1. 修改：列表字體也放大以保持一致 */
            }

            .filter-item:last-child {
                border-bottom: none;
            }

            .filter-item-word {
                flex-grow: 1;
                margin-right: 10px;
                overflow-wrap: break-word;
                word-break: break-all;
            }

            .filter-item.is-disabled .filter-item-word {
                text-decoration: line-through;
                color: #999;
            }

            .filter-item-controls {
                display: flex;
                align-items: center;
                flex-shrink: 0;
            }

            #filter-panel .toggle-switch {
                position: relative;
                display: inline-block;
                width: 34px;
                height: 20px;
                margin-right: 8px;
            }

            #filter-panel .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            #filter-panel .slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc !important;
                transition: .4s;
                border-radius: 20px;
            }

            #filter-panel .slider:before {
                position: absolute;
                content: "";
                height: 14px;
                width: 14px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }

            #filter-panel input:checked + .slider {
                background-color: ${PRIMARY_COLOR} !important;
            }

            #filter-panel input:checked + .slider:before {
                transform: translateX(14px);
            }

            .remove-btn {
                background: none;
                border: none;
                color: ${PRIMARY_COLOR};
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                padding: 0 5px;
                line-height: 1;
            }

            .remove-btn:hover {
                color: ${PRIMARY_COLOR_DARK};
            }
        `;
        document.head.appendChild(styleElement);
    }

    /**
     * 綁定所有 UI 元素的事件監聽器
     */
    function addEventListeners() {
        document.getElementById('filter-toggle-btn').addEventListener('click', () => {
            document.getElementById('filter-ui-container').classList.toggle('is-expanded');
        });

        document.getElementById('filter-add-btn').addEventListener('click', onAddWord);
        document.getElementById('filter-add-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                onAddWord();
            }
        });

        document.getElementById('filter-word-list').addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) {
                const word = e.target.closest('.filter-item').dataset.word;
                onRemoveWord(word);
            } else if (e.target.classList.contains('slider') || e.target.classList.contains('toggle-switch')) {
                // 'change' event will handle this
            }
        });

        document.getElementById('filter-word-list').addEventListener('change', (e) => {
             if (e.target.type === 'checkbox') {
                const word = e.target.closest('.filter-item').dataset.word;
                const isEnabled = e.target.checked;
                onToggleWord(word, isEnabled);
            }
        });
    }

    /**
     * @param {string} xpath - 要查詢的 XPath
     * @returns {string | null} - CSS 選擇器, e.g., "div.classA.classB"
     */
    function getClassSelectorFromXPath(xpath) {
        try {
            const xpathResult = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const element = xpathResult.singleNodeValue;

            if (element && element.classList.length > 0) {
                const tagName = element.tagName.toLowerCase();
                const classSelector = Array.from(element.classList).join('.');
                const dynamicSelector = `${tagName}.${classSelector}`;
                console.log(`Carousell Filter: 成功獲取動態選擇器 for ${xpath}:`, dynamicSelector);
                return dynamicSelector;
            } else {
                return null; // 2. 移除：不再返回 fallback
            }
        } catch (error) {
            console.error(`Carousell Filter: XPath 執行錯誤 (for ${xpath}):`, error);
            return null; // 2. 移除：不再返回 fallback
        }
    }

    /**
     * 2. 移除：嘗試所有 XPath 來找到當前活躍的商品選擇器
     * @returns {string | null} - 找到的 CSS 選擇器，或 null
     */
    function findActiveItemSelector() {
        for (const xpath of ITEM_XPATHS) {
            const selector = getClassSelectorFromXPath(xpath);
            if (selector) {
                return selector;
            }
        }
        console.warn(`Carousell Filter: 所有 XPath 都未找到商品元素。`);
        return null; // 2. 移除：不再返回 fallback
    }


    /**
     * 從 localStorage 加載過濾詞列表
     */
    function loadFilterWords() {
        try {
            const savedWordsRaw = localStorage.getItem(STORAGE_KEY);
            if (savedWordsRaw) {
                managedFilterWords = JSON.parse(savedWordsRaw);
            } else {
                managedFilterWords = defaultBannedWords.map(word => ({ word: word, enabled: true }));
            }
        } catch (e) {
            console.error("Carousell Filter: 無法加載過濾詞, 重置為預設值。", e);
            managedFilterWords = defaultBannedWords.map(word => ({ word: word, enabled: true }));
        }
        renderWordList();
    }

    /**
     * 將當前的過濾詞列表保存到 localStorage
     */
    function saveFilterWords() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(managedFilterWords));
        } catch (e) {
             console.error("Carousell Filter: 無法保存過濾詞。", e);
        }
    }

    /**
     * 根據 managedFilterWords 陣列重新渲染 UI 列表
     */
    function renderWordList() {
        const listContainer = document.getElementById('filter-word-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';

        managedFilterWords.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'filter-item';
            itemEl.dataset.word = item.word;
            if (!item.enabled) {
                itemEl.classList.add('is-disabled');
            }

            itemEl.innerHTML = `
                <span class="filter-item-word">${escapeHTML(item.word)}</span>
                <div class="filter-item-controls">
                    <label class="toggle-switch">
                        <input type="checkbox" ${item.enabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <button class="remove-btn" title="移除">&times;</button>
                </div>
            `;
            listContainer.appendChild(itemEl);
        });
    }

    /**
     * "確定" 按鈕的點擊處理函數
     */
    function onAddWord() {
        const input = document.getElementById('filter-add-input');
        const newWord = input.value.trim();

        if (newWord && !managedFilterWords.some(item => item.word === newWord)) {
            managedFilterWords.unshift({ word: newWord, enabled: true });
            saveFilterWords();
            renderWordList();
            input.value = '';
            runAllFilters();
        }
    }

    /**
     * "X" 按鈕的點擊處理函數
     */
    function onRemoveWord(wordToRemove) {
        managedFilterWords = managedFilterWords.filter(item => item.word !== wordToRemove);
        saveFilterWords();
        renderWordList();
        runAllFilters();
    }

    /**
     * "Toggle" 按鈕的點擊處理函數
     */
    function onToggleWord(wordToToggle, isEnabled) {
        const item = managedFilterWords.find(item => item.word === wordToToggle);
        if (item) {
            item.enabled = isEnabled;
            saveFilterWords();
            const itemEl = document.querySelector(`.filter-item[data-word="${escapeCSS(wordToToggle)}"]`);
            if (itemEl) {
                itemEl.classList.toggle('is-disabled', !isEnabled);
            }
            runAllFilters();
        }
    }

    /**
     * 核心過濾函數 (關鍵詞)
     */
    function filterListings() {
        // 2. 移除：修改檢查邏輯
        if (!itemClassSelector) {
            const dynamicSelector = findActiveItemSelector();
            if (dynamicSelector) {
                console.log('Carousell Filter: [運行時] 成功獲取商品列表選擇器。');
                itemClassSelector = dynamicSelector;
            } else {
                return; // 如果還是找不到選擇器，則不執行過濾
            }
        }

        const activeWords = managedFilterWords
            .filter(item => item.enabled)
            .map(item => item.word);

        const items = document.querySelectorAll(itemClassSelector);

        if (activeWords.length === 0) {
            items.forEach(item => {
                item.style.display = '';
            });
            return;
        }

        items.forEach(item => {
            const textContent = item.textContent.replace(/\s+/g, '');
            let shouldHide = false;

            for (let banned of activeWords) {
                if (textContent.includes(banned)) {
                    shouldHide = true;
                    break;
                }
            }

            item.style.display = shouldHide ? 'none' : '';
        });
    }

    /**
     * 根據 class name 移除廣告元素
     */
    function removeAdsByClass() {
        if (!adClassSelector) {
            adClassSelector = getClassSelectorFromXPath(AD_XPATH); // 2. 移除：移除 fallback
            if (!adClassSelector) {
                return;
            } else {
                 console.log('Carousell Filter: [運行時] 成功獲取廣告列表選擇器。');
            }
        }

        try {
            const adItems = document.querySelectorAll(adClassSelector);
            adItems.forEach(item => {
                if (item.style.display !== 'none') {
                    item.style.display = 'none';
                }
            });
        } catch (e) {
            console.error('Carousell Filter: 移除廣告時出錯:', e);
            adClassSelector = null;
        }
    }

    /**
     * 運行所有過濾器
     */
    function runAllFilters() {
        filterListings();
        removeAdsByClass();
    }

    /**
     * 輔助函數：轉義 HTML 特殊字符
     */
    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, function(m) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[m];
        });
    }

    /**
     * 輔助函數：轉義 CSS 選擇器中的特殊字符
     */
     function escapeCSS(str) {
        return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
     }


    /**
     * 腳本初始化
     */
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setup);
        } else {
            setup();
        }
    }

    /**
     * 分離出的 setup 函數
     */
    function setup() {
        itemClassSelector = findActiveItemSelector();
        adClassSelector = getClassSelectorFromXPath(AD_XPATH); // 2. 移除：移除 fallback

        injectStyles();
        injectUI();

        addEventListeners();

        loadFilterWords();

        setTimeout(runAllFilters, 500);

        const observer = new MutationObserver(runAllFilters);
        observer.observe(document.body, { childList: true, subtree: true });

        setInterval(runAllFilters, 3000);
    }

    init();

})();

