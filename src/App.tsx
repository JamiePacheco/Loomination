import React from 'react';
import './App.css';
import { BrowserRouter, Route, Routes } from 'react-router';
import HomePage from './pages/home/home-page';

function App() {
  return (
    <BrowserRouter>
      <header className='app-header'>
        <h2></h2>
      </header>

      <div className='App'>
            <Routes>
                <Route path = '/' element = {<HomePage/>} />
            </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;