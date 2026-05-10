import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Home Page - Coming Soon</div>} />
        <Route path="/login" element={<div>Login - Coming Soon</div>} />
        <Route path="/register" element={<div>Register - Coming Soon</div>} />
        <Route path="/dashboard" element={<div>Dashboard - Coming Soon</div>} />
        <Route path="/accounts" element={<div>Accounts - Coming Soon</div>} />
        <Route path="/transactions" element={<div>Transactions - Coming Soon</div>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
