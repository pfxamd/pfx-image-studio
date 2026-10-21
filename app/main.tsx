/**
 * ┌──────────────────────────────────────────────┐
 * │                                              │
 * │  PFxamd                                      │
 * │  Ahmed                                       │
 * │                                              │
 * └──────────────────────────────────────────────┘
 *
 * @project     PFx Image Studio
 * @author      Ahmed
 * @brand       PFxamd
 * @website     https://www.pfxamd.com
 * @repository  https://github.com/pfxamd/pfx-image-studio
 * @license     Apache-2.0
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/global.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('PFx Image Studio root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
