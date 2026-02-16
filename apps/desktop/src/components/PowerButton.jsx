/**
 * PowerButton — animated circular VPN toggle with glow effect.
 */

import React from 'react';

export default function PowerButton({ state, disabled, onToggle }) {
    const stateClass =
        state === 'CONNECTED' ? 'connected' :
            state === 'CONNECTING' ? 'connecting' :
                state === 'ERROR' ? 'error' : '';

    return (
        <div className="power-button-wrapper">
            <div className={`power-button-glow ${stateClass === 'connected' ? 'active' : ''} ${stateClass === 'connecting' ? 'connecting' : ''}`} />
            <button
                className={`power-button ${stateClass} ${disabled ? 'disabled' : ''}`}
                onClick={disabled ? undefined : onToggle}
                disabled={disabled}
                aria-label="Toggle VPN connection"
            >
                <span className="power-icon">⏻</span>
            </button>
        </div>
    );
}
