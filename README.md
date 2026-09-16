# My Niyagama - System Administrator Portal

This project is a full-stack application with a **React (Vite)** frontend and an **Express (Node.js)** backend.

## Prerequisites
- Node.js 18+
- npm
- MySQL Server

## Local Development Setup
1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Configure Environment Variables:**
    Copy `.env.example` to `.env` and update your MySQL credentials.
    ```bash
    cp .env.example .env
    ```
3.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The server will run at `http://localhost:3000`.

4.  **Initialize Database:**
    Once the app is running, use the "Initialize Database" feature in the UI or send a POST request to `/api/setup-db` to create the tables.

## Database Configuration
This application uses **MySQL** via Knex.js. Ensure you have a MySQL database created and the credentials are correctly set in your `.env` file.

## Login Credentials (Default)
- **Biometric ID:** `1001`
- **System PIN:** `1234`
- **Role:** System Administrator (SA)
