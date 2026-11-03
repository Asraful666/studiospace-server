# StudioSpace Server

Backend API for StudioSpace, a platform for discovering creative studios and managing studio listings and booking requests.

## Live Links

- Backend: https://studiospace-server-eta.vercel.app/
- Frontend: https://studiospace-client-weld-seven.vercel.app/

## Technologies

- Node.js
- Express.js
- MongoDB
- Better Auth
- CORS
- dotenv
- ImgBB

## Features

- Email and password authentication
- Google sign-in integration
- Host and Guest roles
- Studio listing and details
- Studio management for hosts
- Booking request management
- Role-based access to protected operations
- Image upload integration with ImgBB

## Local Setup

### 1. Download the repository

Clone this backend repository and open its folder in your terminal.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

The following is an example. Match the variable names with the names used in the server code.

```env
PORT=8000

MONGODB_URI=your_mongodb_connection_string

BETTER_AUTH_SECRET=your_random_auth_secret
BETTER_AUTH_URL=http://localhost:8000

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

IMGBB_API_KEY=your_imgbb_api_key
```

Add any database-name or frontend-origin variables required by your configuration.

Never commit the `.env` file or real credentials to GitHub.

### 4. Start the server

Check the scripts available in `package.json`:

```bash
npm run
```

If a `dev` script is configured, run:

```bash
npm run dev
```

Use the start command defined in your repository if it differs.

## Authentication

StudioSpace uses Better Auth for authentication.

Users sign in before accessing protected features. The backend checks the authenticated session and the required role before allowing protected operations.

### Roles

| Role | Purpose |
|------|---------|
| Host | Manage studio listings and booking requests |
| Guest | Explore studios and manage personal booking requests |

## Environment Configuration

| Variable | Purpose |
|----------|---------|
| `PORT` | Local server port |
| `MONGODB_URI` | MongoDB connection string |
| `BETTER_AUTH_SECRET` | Authentication secret |
| `BETTER_AUTH_URL` | Authentication server base URL |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `IMGBB_API_KEY` | Server-side image upload API key |

## Deployment

The backend is hosted on Vercel.

For production:

- Configure the required environment variables in Vercel.
- Set the authentication base URL to the deployed backend URL.
- Configure the deployed frontend origin in CORS and authentication settings.
- Configure the production Google OAuth callback URL.
- Redeploy after changing environment variables.

Keep secrets on the server and use placeholders in documentation.

## Project Structure

Refer to the repository source files for the actual route definitions, middleware, database configuration, and authentication setup.

## Project Notice

StudioSpace is an educational demonstration project. It does not provide real payment processing, insurance, or commercial booking guarantees.

## Developer

**Md Asraful Islam**

GitHub: https://github.com/Asraful666