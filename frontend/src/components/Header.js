import React from "react";
import logo from "../assets/logo-silveira.png";

export default function Header({ title = "SMART CSI" }) {
  return (
    <header className="header">
      <img src={logo} alt="Logo Silveira" className="logo-img" />
      <h1 className="title">{title}</h1>
    </header>
  );
}
