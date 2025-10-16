import React from "react";
import "./Modal.css";

export default function Modal({ show, onClose, title, children, size = "md" }) {
  if (!show) return null;
  return (
    <div className="modal-overlay">
      <div className={`modal-content ${size}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
