import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/wind_hybrid.css';

function mount() {
    const container = document.getElementById('wind-app-root');
    if (container) {
        const config = {
            user: container.dataset.user || '',
            isStaff: container.dataset.isStaff === 'true',
            isAuthenticated: container.dataset.isAuthenticated === 'true',
            apiBase: container.dataset.apiBase || '/wind/api/v1'
        };
        const root = createRoot(container);
        root.render(<App config={config} />);
    } else {
        console.warn('#wind-app-root container not found');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
} else {
    mount();
}
