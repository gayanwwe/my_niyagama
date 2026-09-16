# Deployment Guide: AWS Lightsail + aaPanel + Apache

This guide explains how to deploy the **Happy Niyagama** system to your AWS Lightsail instance using aaPanel and Apache.

## Prerequisites

1.  **AWS Lightsail Instance**: Ubuntu 22.04 or 24.04 recommended.
2.  **aaPanel Installed**: Ensure aaPanel is running on your instance.
3.  **Domain**: `myniyagama.jo3.org` pointed to your Lightsail IP.

---

## Step 1: Prepare the Application

1.  **Build the Frontend**:
    In your local environment or via the terminal in aaPanel, run:
    ```bash
    npm install
    npm run build
    ```
    This creates a `dist` folder.

2.  **Archive Files**:
    Zip the following files/folders to upload to the server:
    - `dist/`
    - `public/`
    - `server.ts`
    - `package.json`
    - `package-lock.json`
    - `tsconfig.json`
    - `.env.example` (rename to `.env` on server)

---

## Step 2: Setup on aaPanel

1.  **Create Website**:
    - Go to **Website** -> **Add site**.
    - Domain: `myniyagama.jo3.org`.
    - Path: `/www/wwwroot/myniyagama`.
    - PHP Version: Pure Static (since we use Node.js).

2.  **Upload Files**:
    - Go to **Files** and navigate to `/www/wwwroot/myniyagama`.
    - Upload your zip file and extract it.

3.  **Install Node.js**:
    - Go to **App Store** and install **Node.js Version Manager**.
    - Install a stable Node.js version (v20+ recommended).

4.  **Create Node.js Project**:
    - Go to **Website** -> **Node project** -> **Add Node project**.
    - **Project Path**: `/www/wwwroot/myniyagama`.
    - **Run Command**: `tsx server.ts`.
    - **Project Name**: `myniyagama`.
    - **Port**: `3000`.
    - **Run User**: `www`.
    - **Auto Start**: Enabled.

---

## Step 3: Database Setup

1.  **Create MySQL Database**:
    - Go to **Database** -> **Add database**.
    - DB Name: `niyagama_db`.
    - User: `niyagama_user`.
    - Password: `your_secure_password`.

2.  **Configure Environment**:
    - Edit the `.env` file in `/www/wwwroot/myniyagama`:
      ```env
      DB_HOST=localhost
      DB_USER=niyagama_user
      DB_PASSWORD=your_secure_password
      DB_NAME=niyagama_db
      DB_PORT=3306
      PORT=3000
      NODE_ENV=production
      JWT_SECRET=your_random_secret_string
      GEMINI_API_KEY=your_actual_key
      ```

---

## Step 4: Apache Reverse Proxy

To make the app accessible via your domain, configure Apache to proxy requests to port 3000.

1.  Go to **Website** -> **myniyagama.jo3.org** -> **Conf**.
2.  Add the following inside the `<VirtualHost *:80>` block (and `*:443` if using SSL):

```apache
# Proxy settings for Node.js
ProxyPass / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/

# Ensure WebSockets work (if needed)
RewriteEngine On
RewriteCond %{HTTP:Upgrade} =websocket [NC]
RewriteRule /(.*)           ws://127.0.0.1:3000/$1 [P,L]
```

3.  **Restart Apache** via aaPanel Dashboard.

> [!NOTE]
> The existing `.htaccess` file in the root is designed for PHP-based shared hosting. For your AWS Lightsail Node.js setup, it is **not needed** and can be deleted or ignored, as the Node.js server handles routing and static files.

---

## Step 5: Final Checks

1.  **Initialize Database**:
    The system has a built-in setup route. Once the app is running, visit:
    `http://myniyagama.jo3.org/api/setup-db` (via POST) or ensure the server logs show migration success.

2.  **Logs**:
    Check the Node.js project logs in aaPanel if the site doesn't load.

3.  **SSL**:
    Use aaPanel's **Let's Encrypt** feature to secure your site with HTTPS.
