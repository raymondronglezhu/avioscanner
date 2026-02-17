import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectButton } from '@seats-aero/react-blocks';
import seatsBlocksStyles from '@seats-aero/react-blocks/styles.css?inline';

const DEFAULT_STATE = {
    disabled: false,
    hovered: false,
    size: 'sm',
};

function getButtonStyle(state) {
    const isInteractive = !state.disabled;
    const bg = isInteractive
        ? (state.hovered ? '#3b82f6' : '#2563eb')
        : '#334155';
    const border = isInteractive
        ? (state.hovered ? '1px solid #93c5fd' : '1px solid #60a5fa')
        : '1px solid #475569';
    const shadow = isInteractive
        ? (state.hovered ? '0 0 0 3px rgba(59,130,246,0.25), 0 8px 20px rgba(37,99,235,0.45)' : '0 6px 18px rgba(37,99,235,0.30)')
        : 'none';

    return {
        background: bg,
        color: '#f8fafc',
        border,
        borderRadius: '10px',
        height: state.size === 'sm' ? '38px' : '46px',
        padding: state.size === 'sm' ? '0 12px' : '0 16px',
        cursor: isInteractive ? 'pointer' : 'not-allowed',
        boxShadow: shadow,
        transition: 'background 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
        fontWeight: 600,
    };
}

export function mountOAuthConnectButton(container, onClick) {
    container.style.display = 'inline-flex';

    const hasShadowRoot = !!container.shadowRoot;
    const shadowRoot = container.shadowRoot || container.attachShadow({ mode: 'open' });
    if (!hasShadowRoot) {
        const styleEl = document.createElement('style');
        styleEl.textContent = seatsBlocksStyles;
        shadowRoot.appendChild(styleEl);
    }

    const mountNode = document.createElement('div');
    shadowRoot.appendChild(mountNode);

    const root = createRoot(mountNode);
    let state = { ...DEFAULT_STATE };

    function render() {
        root.render(
            createElement(ConnectButton, {
                size: state.size,
                disabled: state.disabled,
                onClick,
                onMouseEnter: () => {
                    if (!state.disabled) {
                        state = { ...state, hovered: true };
                        render();
                    }
                },
                onMouseLeave: () => {
                    if (state.hovered) {
                        state = { ...state, hovered: false };
                        render();
                    }
                },
                style: getButtonStyle(state),
                type: 'button',
            })
        );
    }

    render();

    return {
        setState(nextState = {}) {
            state = {
                ...state,
                ...nextState,
            };
            if (state.disabled && state.hovered) {
                state.hovered = false;
            }
            render();
        },
        unmount() {
            root.unmount();
        },
    };
}
