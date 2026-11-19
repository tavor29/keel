import { Navigate } from 'react-router';
import { usePrograms } from '@/api/queries';
import { NotFound } from '@/features/ScreenPlaceholder';

/** "/" → the first program this persona can see. */
export function RootRedirect() {
  const programs = usePrograms().data;
  if (!programs) return null;
  const first = programs[0];
  return first ? <Navigate to={`/p/${first.id}/briefing`} replace /> : <NotFound />;
}
