import React from "react";
import "./DirectionsPanel.css";

const DirectionsPanel = ({ steps }) => {
    if (!steps || steps.length === 0) return null;

    return (
        <div className="directions-panel">
            <h3 className="panel-header">🧭 Rota Adımları</h3>
            <h2 className="panel-subheader"> Tahmini Süre: {Math.round(steps.reduce((acc, step) => acc + step.duration, 0) / 60)} dk {Math.round(steps.reduce((acc, step) => acc + step.duration, 0))%60} sn</h2>
            <h2 className="panel-subheader"> Tahmini Mesafe: {Math.round(steps.reduce((acc, step) => acc + step.distance, 0))} m</h2>
            <ol className="steps-list">
                {steps.map((step, index) => (
                    <li key={index} className="step-item">
                        <span className="step-icon">➡️</span>
                        <div>
                            <div className="step-name">{step.name || "İsimsiz Cadde"}</div>
                            <div className="step-meta">
                                {Math.round(step.distance)} m – {Math.round(step.duration)} sn
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
};

export default DirectionsPanel;
