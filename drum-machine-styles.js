/* drum-machine-styles.css */

.drum-machine-panel {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, 
    rgba(255, 200, 200, 0.6) 0%, 
    rgba(255, 220, 200, 0.6) 100%);
}

.drum-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border-light);
}

.drum-clock-selector {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.drum-clock-selector label {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.drum-clock-selector select {
  padding: var(--space-sm) var(--space-md);
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.drum-randomize-section {
  margin-bottom: var(--space-lg);
}

.drum-randomize-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-sm);
}

.drum-randomize-btn {
  padding: var(--space-md);
  background: rgba(255, 255, 255, 0.6);
  border: 2px solid var(--border-light);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.drum-randomize-btn:hover {
  background: rgba(255, 255, 255, 0.8);
  border-color: var(--border-medium);
  transform: translateY(-2px);
}

.drum-randomize-btn:active {
  transform: translateY(0);
}

.drum-randomize-btn.primary {
  background: linear-gradient(135deg, #e08080, #f7c49a);
  color: white;
  border-color: #e08080;
}

.drum-randomize-btn.primary:hover {
  background: linear-gradient(135deg, #d67070, #f0b080);
}

.drum-voices-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.drum-voice-section {
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.drum-voice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border-light);
}

.drum-voice-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.drum-mute-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.drum-mute-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.drum-mute-toggle span {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.drum-voice-section.muted {
  opacity: 0.5;
}

.drum-param-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.drum-param-row:last-child {
  margin-bottom: 0;
}

.drum-param-row label {
  flex: 0 0 60px;
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.drum-param-row input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  cursor: pointer;
}

.drum-param-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: var(--text-primary);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.drum-param-row input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.drum-param-value {
  flex: 0 0 45px;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-primary);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.drum-global-controls {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-light);
}

.drum-control-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.drum-control-group label {
  font-size: 0.7rem;
  color: var(--text-secondary);
  font-weight: 500;
}

@media (max-width: 1024px) {
  .drum-voices-container {
    grid-template-columns: 1fr;
  }
  
  .drum-randomize-grid {
    grid-template-columns: 1fr;
  }
}
