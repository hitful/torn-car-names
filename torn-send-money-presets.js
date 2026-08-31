// ==UserScript==
// @name         Torn Send Money Presets
// @namespace    https://github.com/hitful/torn-userscripts
// @version      1.0
// @description  Adds preset amount buttons to the profile send-money dialog so you can fill common amounts with one click.
// @author       hit
// @match        https://www.torn.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/hitful/torn-userscripts/refs/heads/main/torn-send-money-presets.js
// @updateURL    https://raw.githubusercontent.com/hitful/torn-userscripts/refs/heads/main/torn-send-money-presets.js
// ==/UserScript==

(function () {
    'use strict';

    const SETTINGS_KEY = 'tsmp-presets-v1';
    const DEFAULT_PRESETS = [
        { label: 'Rent', amount: 352_500 },
    ];

    const formatNumber = (value) => Number(value).toLocaleString('en-US');

    const parseAmountToken = (value) => {
        const normalized = String(value)
            .trim()
            .toLowerCase()
            .replace(/\$/g, '')
            .replace(/,/g, '')
            .replace(/\s+/g, '');

        if (!normalized) return null;

        const match = normalized.match(/^(\d+(?:\.\d+)?)([kmbt])?$/);
        if (!match) return null;

        const amount = Number(match[1]);
        if (!Number.isFinite(amount) || amount <= 0) return null;

        const multipliers = { k: 1_000, m: 1_000_000, b: 1_000_000_000, t: 1_000_000_000_000 };
        return Math.round(amount * (multipliers[match[2]] || 1));
    };

    const compactAmount = (amount) => {
        const units = [
            ['b', 1_000_000_000],
            ['m', 1_000_000],
            ['k', 1_000],
        ];

        for (const [suffix, divisor] of units) {
            if (amount >= divisor) {
                const scaled = amount / divisor;
                const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
                const printable = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
                return `$${printable}${suffix}`;
            }
        }

        return `$${formatNumber(amount)}`;
    };

    const loadPresets = () => {
        try {
            const raw = GM_getValue(SETTINGS_KEY, '');
            if (!raw) return DEFAULT_PRESETS.map((preset) => ({ ...preset }));

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || !parsed.length) {
                return DEFAULT_PRESETS.map((preset) => ({ ...preset }));
            }

            return parsed
                .map((preset) => {
                    const amount = typeof preset.amount === 'number'
                        ? Math.round(preset.amount)
                        : parseAmountToken(preset.amount);
                    const label = String(preset.label || '').trim();

                    if (!amount || amount <= 0) return null;

                    return {
                        label: label || compactAmount(amount),
                        amount,
                    };
                })
                .filter(Boolean)
                .slice(0, 8);
        } catch {
            return DEFAULT_PRESETS.map((preset) => ({ ...preset }));
        }
    };

    const savePresets = (presets) => {
        GM_setValue(SETTINGS_KEY, JSON.stringify(presets));
    };

    let currentPresets = loadPresets();

    GM_addStyle(`
        .tsmp-container {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
        }

        .tsmp-btn {
            appearance: none;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 6px;
            background: linear-gradient(180deg, #353b42 0%, #272d33 100%);
            color: #eef2f6;
            cursor: pointer;
            font: 600 12px/1 Manrope, Arial, sans-serif;
            min-height: 28px;
            padding: 0 10px;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 1px 2px rgba(0, 0, 0, 0.16);
        }

        .tsmp-btn:hover {
            border-color: rgba(255, 255, 255, 0.24);
            background: linear-gradient(180deg, #3b434b 0%, #2c333a 100%);
        }

        .tsmp-btn:active {
            transform: translateY(1px);
        }
    `);

    const setReactInputValue = (input, value) => {
        if (!input) return;

        const formatted = formatNumber(value);
        input.value = formatted;
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const hiddenSibling = input.parentElement?.querySelector('input[type="hidden"].input-money');
        if (hiddenSibling) {
            hiddenSibling.value = String(value);
            hiddenSibling.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    const findSendCashDialog = () => {
        const messageInput = document.querySelector('.send-cash-message-input');
        if (!messageInput) return null;

        const dialog = messageInput.closest('[role="dialog"], form, .cont, .ReactModal__Content, [class*="modal"]')
            || messageInput.parentElement?.parentElement?.parentElement;

        if (!dialog) return null;

        const amountInput = dialog.querySelector('input.input-money[type="text"]')
            || dialog.querySelector('.input-money-group input.input-money')
            || document.querySelector('input.input-money[type="text"]');

        if (!amountInput) return null;

        return { dialog, amountInput };
    };

    const renderPresetButtons = (container, amountInput) => {
        container.replaceChildren();

        currentPresets.forEach((preset) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tsmp-btn';
            button.textContent = `${preset.label} (${compactAmount(preset.amount)})`;
            button.title = `Fill ${formatNumber(preset.amount)}`;
            button.addEventListener('click', () => {
                setReactInputValue(amountInput, preset.amount);
                amountInput.focus();
            });
            container.appendChild(button);
        });
    };

    const enhanceSendCashDialog = () => {
        const match = findSendCashDialog();
        if (!match) return;

        const moneyGroup = match.amountInput.closest('.input-money-group');
        const anchor = moneyGroup || match.amountInput.parentElement;
        if (!anchor) return;

        let container = match.dialog.querySelector('.tsmp-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'tsmp-container';
            anchor.insertAdjacentElement('afterend', container);
        }

        renderPresetButtons(container, match.amountInput);
    };

    const scanForSendCashDialog = () => {
        enhanceSendCashDialog();
    };

    const configurePresets = () => {
        const example = currentPresets
            .map((preset) => `${preset.label}:${preset.amount}`)
            .join('\n');

        const input = prompt(
            'Enter one preset per line as Label:amount\nExamples:\nRent:352500\nRent:352.5k\nUtilities:100k',
            example
        );

        if (input === null) return;

        const presets = input
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const separator = line.indexOf(':');
                if (separator === -1) {
                    const amount = parseAmountToken(line);
                    return amount ? { label: compactAmount(amount), amount } : null;
                }

                const label = line.slice(0, separator).trim();
                const amount = parseAmountToken(line.slice(separator + 1));
                if (!amount) return null;

                return {
                    label: label || compactAmount(amount),
                    amount,
                };
            })
            .filter(Boolean);

        if (!presets.length) {
            alert('No valid presets found. Use lines like Rent:352500 or Rent:352.5k');
            return;
        }

        currentPresets = presets;
        savePresets(currentPresets);
        scanForSendCashDialog();
    };

    GM_registerMenuCommand('Configure send-money presets', configurePresets);

    const observer = new MutationObserver(() => {
        scanForSendCashDialog();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    scanForSendCashDialog();
})();
