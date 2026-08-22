import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { EditorPage } from './pages/EditorPage';
import { ViewPage } from './pages/ViewPage';
import { routerBasename } from './share';

function HashGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/edit' && location.hash.startsWith('#m=')) {
      navigate({ pathname: '/', hash: location.hash }, { replace: true });
    }
  }, [location.hash, location.pathname, navigate]);

  return null;
}

function SpaRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const raw = sessionStorage.getItem('cw-map-redirect');
    if (!raw) return;
    sessionStorage.removeItem('cw-map-redirect');
    const url = new URL(raw, window.location.origin);
    const basename = routerBasename();
    let path = url.pathname;
    if (basename !== '/' && path.startsWith(basename)) {
      path = path.slice(basename.length) || '/';
    }
    if (!path.startsWith('/')) path = `/${path}`;
    navigate(`${path}${url.search}${url.hash}`, { replace: true });
  }, [navigate]);

  return null;
}

export default function App() {
  const basename = routerBasename();

  return (
    <BrowserRouter basename={basename === '/' ? undefined : basename}>
      <HashGuard />
      <SpaRedirect />
      <Routes>
        <Route path="/" element={<ViewPage />} />
        <Route path="/edit" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
