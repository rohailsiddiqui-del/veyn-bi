import { AuthProvider } from './context/AuthContext';
import './globals.css';

export const metadata = {
  title: 'Veyn.ai — CX Intelligence',
  description: 'Call Centre Intelligence Platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
