// ==UserScript==
// @name         Carousell 關鍵字 Filter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Hide Carousell listings containing banned Chinese words, with a UI to manage the filter list.
// @author       9code.ai
// @match        https://www.carousell.com.hk/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
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

    // 用於獲取【商品列表項】動態 class name 的 XPath
    const ITEM_XPATH = '/html/body/div[1]/div/main/div[2]/div/section[2]/div[1]/div/div[2]/div/div[1]';

    // 【商品列表項】XPath 失敗時的後備 CSS 選擇器
    const FALLBACK_SELECTOR = ['div.D_sg.D_sr','div.M_sU.M_sR'].join(', ');

    // 3. 新增：用於獲取【廣告/推廣項】動態 class name 的 XPath
    const AD_XPATH = '/html/body/div[1]/div/main/div/div[1]/div[4]/div[29]/div/div';


    // --- 全域變數 ---

    // 存儲過濾詞對象 { word: '...', enabled: true/false }
    let managedFilterWords = [];

    // 存儲動態獲取的【商品列表項】CSS 選擇器
    let itemClassSelector = FALLBACK_SELECTOR;

    // 3. 新增：存儲動態獲取的【廣告/推廣項】CSS 選擇器
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
        const PANEL_WIDTH = '256px'; // 要求的面板寬度

        GM_addStyle(`
            #filter-ui-container {
                position: fixed;
                top: 50%;
                right: 0;
                /* 2. 修正：恢復 1.7 版的統一滑動佈局 */
                transform: translateY(-50%) translateX(${PANEL_WIDTH});
                z-index: 9999;
                font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
                /* 使用 flex 讓按鈕和面板水平排列 */
                display: flex;
                align-items: center;
                transition: transform 0.3s ease-out;
            }

            #filter-ui-container.is-expanded {
                /* 展開狀態：滑回原位 (translateX(0)) */
                transform: translateY(-50%) translateX(0);
            }

            #filter-toggle-btn {
                /* 按鈕現在是 flex 佈局的一部分 */
                position: relative;
                order: 1; /* 按鈕在左側 */
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
                transform: rotate(180deg); /* 箭頭旋轉 */
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
                order: 2; /* 面板在右側 */
            }

            .panel-header {
                font-size: 16px;
                font-weight: bold;
                padding: 12px;
                background-color: ${PRIMARY_COLOR}; /* 紅色主題 */
                color: white; /* 白色文字 */
                border-bottom: 1px solid #ddd;
                text-align: center;
                border-top-right-radius: 8px;
                border-top-left-radius: 8px;
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
                font-size: 14px;
                margin-right: 5px;
            }
            #filter-add-input:focus {
                border-color: ${PRIMARY_COLOR};
                box-shadow: 0 0 0 2px ${PRIMARY_COLOR}33;
                outline: none;
            }

            #filter-add-btn {
                padding: 8px 12px;
                font-size: 14px;
                background-color: ${PRIMARY_COLOR}; /* 紅色主題 */
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
            }

            #filter-add-btn:hover {
                background-color: ${PRIMARY_COLOR_DARK}; /* 深紅色 */
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
                font-size: 14px;
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

            /* 修正：增加 Slider 樣式權重 */
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
                color: ${PRIMARY_COLOR}; /* 紅色主題 */
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                padding: 0 5px;
                line-height: 1;
            }

            .remove-btn:hover {
                color: ${PRIMARY_COLOR_DARK}; /* 深紅色 */
            }
        `);
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
                const input = e.target.closest('.filter-item').querySelector('input[type="checkbox"]');
                if (input && !e.target.classList.contains('remove-btn')) {
                    // change 事件會自動處理
                }
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
     * 3. 修改：通用的 XPath 獲取 class 選擇器函數
     * @param {string} xpath - 要查詢的 XPath
     * @param {string | null} fallbackSelector - 失敗時返回的後備選擇器
     * @returns {string | null} - CSS 選擇器, e.g., "div.classA.classB"
     */
    function getClassSelectorFromXPath(xpath, fallbackSelector) {
        try {
            const xpathResult = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const element = xpathResult.singleNodeValue;

            if (element && element.classList.length > 0) {
                // 創建一個基於標籤和 class 的精確選擇器
                const tagName = element.tagName.toLowerCase();
                const classSelector = Array.from(element.classList).join('.');
                const dynamicSelector = `${tagName}.${classSelector}`;

                console.log(`Carousell Filter: 成功獲取動態選擇器 for ${xpath}:`, dynamicSelector);
                return dynamicSelector;
            } else {
                console.warn(`Carousell Filter: XPath 元素未找到 (for ${xpath})。將使用後備選擇器。`);
                return fallbackSelector;
            }
        } catch (error) {
            console.error(`Carousell Filter: XPath 執行錯誤 (for ${xpath}):`, error);
            return fallbackSelector;
        }
    }


    /**
     * 從 GM 存儲中加載過濾詞列表
     */
    async function loadFilterWords() {
        const savedWords = await GM_getValue('carousellFilterWords', null);
        if (savedWords) {
            managedFilterWords = savedWords;
        } else {
            managedFilterWords = defaultBannedWords.map(word => ({ word: word, enabled: true }));
        }
        renderWordList();
    }

    /**
     * 將當前的過濾詞列表保存到 GM 存儲
     */
    async function saveFilterWords() {
        await GM_setValue('carousellFilterWords', managedFilterWords);
    }

    /**
     * 根據 managedFilterWords 陣列重新渲染 UI 列表
     */
    function renderWordList() {
        const listContainer = document.getElementById('filter-word-list');
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
            runAllFilters(); // 3. 修正：運行所有過濾器
        }
    }

    /**
     * "X" 按鈕的點擊處理函數
     */
    function onRemoveWord(wordToRemove) {
        managedFilterWords = managedFilterWords.filter(item => item.word !== wordToRemove);
        saveFilterWords();
        renderWordList();
        runAllFilters(); // 3. 修正：運行所有過濾器
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
            runAllFilters(); // 3. 修正：運行所有過濾器
        }
    }

    /**
     * 核心過濾函數 (關鍵詞)
     */
    function filterListings() {
        const activeWords = managedFilterWords
            .filter(item => item.enabled)
            .map(item => item.word);

        // 使用動態獲取的選擇器
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
     * 3. 新增：根據 class name 移除廣告元素
     */
    function removeAdsByClass() {
        if (!adClassSelector) {
            // 如果 adClassSelector 還未找到 (可能頁面剛加載完)
            // 嘗試在運行時再次獲取
            adClassSelector = getClassSelectorFromXPath(AD_XPATH, null);
            if (!adClassSelector) {
                // 這次也找不到，直接返回，下次再試
                return;
            }
        }

        try {
            const adItems = document.querySelectorAll(adClassSelector);
            adItems.forEach(item => {
                // 檢查是否已經被隱藏，避免重複操作
                if (item.style.display !== 'none') {
                    item.style.display = 'none';
                }
            });
        } catch (e) {
            console.error('Carousell Filter: 移除廣告時出錯:', e);
            // 如果選擇器失效，重置它，以便下次重新獲取
            adClassSelector = null;
        }
    }

    /**
     * 3. 新增：運行所有過濾器
     */
    function runAllFilters() {
        filterListings(); // 關鍵詞過濾
        removeAdsByClass(); // 廣告 class 過濾
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
    async function init() {
        // 1. 獲取動態選擇器
        itemClassSelector = getClassSelectorFromXPath(ITEM_XPATH, FALLBACK_SELECTOR);
        adClassSelector = getClassSelectorFromXPath(AD_XPATH, null); // 初始嘗試獲取

        // 2. 注入 CSS 和 HTML
        injectStyles();
        injectUI();

        // 3. 綁定事件
        addEventListeners();

        // 4. 加載保存的詞彙
        await loadFilterWords();

        // 初始運行
        setTimeout(runAllFilters, 500); // 3. 修正：運行所有過濾器

        // 設置 MutationObserver
        const observer = new MutationObserver(runAllFilters); // 3. 修正：運行所有過濾器
        observer.observe(document.body, { childList: true, subtree: true });

        // 設置定時器作為後備
        setInterval(runAllFilters, 3000); // 3. 修正：運行所有過濾器
    }

    init();

})();

