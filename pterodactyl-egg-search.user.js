// ==UserScript==
// @name         Pterodactyl Egg Search
// @namespace    https://github.com/lauridskern/pterodactyl-egg-search
// @version      1.0
// @description  Adds a searchable dropdown for egg selection in Pterodactyl's egg import modal
// @author       Laurids Kern
// @match        https://*/admin/nests*
// @match        http://*/admin/nests*
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const GITHUB_API_URL = 'https://api.github.com/repos/parkervcp/eggs/git/trees/master?recursive=1';

    GM_addStyle(`
        .egg-combobox-container {
            display: flex;
            flex-direction: column;
            width: 100%;
            margin-bottom: 15px;
        }
        .egg-combobox-input-wrapper {
            position: relative;
            display: flex;
            width: 100%;
        }
        .egg-combobox-input {
            flex: 1;
            width: 100%;
            padding-right: 30px;
        }
        .egg-combobox-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            max-height: 200px;
            overflow-y: auto;
            background-color: #b5bcc1;
            border: 1px solid #ccc;
            border-top: none;
            z-index: 1000;
            display: none;
        }
        .egg-combobox-option {
            padding: 5px 10px;
            cursor: pointer;
            color: #444;
        }
        .egg-combobox-option:hover {
            background-color: #a0a7ac;
        }
        .egg-combobox-arrow {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 4px solid transparent;
            border-top: 5px solid #888;
            pointer-events: none;
        }
        .egg-combobox-error {
            color: #721c24;
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
            padding: 10px;
            margin-top: 10px;
            border-radius: 4px;
        }
    `);

    function formatEggName(name) {
        return name.split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    async function fetchEggJSONs() {
        try {
            const response = await fetch(GITHUB_API_URL);
            if (!response.ok) {
                throw new Error(`GitHub API responded with status: ${response.status}`);
            }
            const data = await response.json();

            const jsonFiles = data.tree.filter(item => item.path.endsWith('.json') && item.path.includes('/egg-'));

            const eggs = await Promise.all(jsonFiles.map(async file => {
                try {
                    const contentResponse = await fetch(`https://raw.githubusercontent.com/parkervcp/eggs/master/${file.path}`);
                    if (!contentResponse.ok) {
                        throw new Error(`Failed to fetch egg JSON: ${contentResponse.status}`);
                    }
                    const json = await contentResponse.text();
                    const name = file.path.split('/').pop().replace('.json', '').replace('egg-', '');
                    return {
                        name: formatEggName(name),
                        json: json
                    };
                } catch (error) {
                    console.error(`Error fetching egg JSON for ${file.path}:`, error);
                    return null;
                }
            }));

            return eggs.filter(egg => egg !== null);
        } catch (error) {
            console.error(`Error fetching egg JSONs: ${error.message}`);
            return [];
        }
    }

    function createComboBox(eggs) {
        const container = document.createElement('div');
        container.className = 'form-group egg-combobox-container';
        container.innerHTML = `
            <label class="control-label" for="eggCombobox">Search for an Egg</label>
            <div class="egg-combobox-input-wrapper">
                <input type="text" id="eggCombobox" class="form-control egg-combobox-input" placeholder="Search and select an egg...">
                <span class="egg-combobox-arrow"></span>
                <div class="egg-combobox-dropdown"></div>
            </div>
        `;

        const input = container.querySelector('#eggCombobox');
        const dropdown = container.querySelector('.egg-combobox-dropdown');

        function updateDropdown() {
            const filter = input.value.toLowerCase();
            const filteredEggs = eggs.filter(egg => egg.name.toLowerCase().includes(filter));
            dropdown.innerHTML = filteredEggs.map(egg => `<div class="egg-combobox-option" data-value="${egg.name}">${egg.name}</div>`).join('');
            dropdown.style.display = filteredEggs.length > 0 ? 'block' : 'none';
        }

        input.addEventListener('input', updateDropdown);
        input.addEventListener('focus', updateDropdown);
        input.addEventListener('blur', () => {
            setTimeout(() => { dropdown.style.display = 'none'; }, 200);
        });

        dropdown.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('egg-combobox-option')) {
                input.value = e.target.textContent;
                dropdown.style.display = 'none';
                const selectedEgg = eggs.find(egg => egg.name === input.value);
                if (selectedEgg) {
                    const fileInput = document.querySelector('input[type="file"]');
                    if (fileInput) {
                        const blob = new Blob([selectedEgg.json], {type: 'application/json'});
                        const file = new File([blob], `${selectedEgg.name.replace(/ /g, '-').toLowerCase()}.json`, {type: 'application/json'});
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(file);
                        fileInput.files = dataTransfer.files;
                    }
                }
            }
        });

        return container;
    }

    function injectComboBox(eggs) {
        const modal = document.querySelector('.modal-content');
        if (!modal) return;

        const modalTitle = modal.querySelector('.modal-title');
        if (!modalTitle || !modalTitle.textContent.trim().includes('Import an Egg')) return;

        const modalBody = modal.querySelector('.modal-body');
        if (!modalBody) return;

        const existingComboBox = modalBody.querySelector('.egg-combobox-container');
        if (existingComboBox) existingComboBox.remove();

        const comboBox = createComboBox(eggs);
        modalBody.insertBefore(comboBox, modalBody.firstChild);
    }

    async function main() {
        try {
            const eggs = await fetchEggJSONs();
            if (eggs.length === 0) {
                throw new Error('No eggs found or error fetching eggs');
            }

            // Check for modal every second
            const intervalId = setInterval(() => {
                const modal = document.querySelector('.modal-content');
                if (modal) {
                    injectComboBox(eggs);
                    clearInterval(intervalId);
                }
            }, 1000);
        } catch (error) {
            console.error('Failed to initialize Pterodactyl Egg Dropdown:', error);
            const modal = document.querySelector('.modal-content .modal-body');
            if (modal) {
                const errorElement = document.createElement('div');
                errorElement.className = 'egg-combobox-error';
                errorElement.textContent = 'Failed to load egg list. Please try refreshing the page or check the console for more details.';
                modal.insertBefore(errorElement, modal.firstChild);
            }
        }
    }

    // Run the script when the page is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }
})();