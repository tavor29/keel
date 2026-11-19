import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '@/api/ApiProvider';
import { createMockApi } from '@/api/mock/mockApi';
import { usePaletteHotkey } from './palette';
import { routes } from './routes';

function Hotkeys() {
  usePaletteHotkey();
  return null;
}

function renderApp(path = '/') {
  const api = createMockApi({ store: null, latency: { min: 0, max: 0 } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ApiProvider api={api}>
      <Hotkeys />
      <RouterProvider router={router} />
    </ApiProvider>,
  );
  return { api, router };
}

describe('app shell', () => {
  it('redirects / to the first program briefing and shows the nav', async () => {
    const { router } = renderApp('/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/p/prg_titan/briefing'));
    const nav = await screen.findByRole('navigation', { name: 'Program' });
    expect(within(nav).getByRole('link', { name: 'Timeline' })).toBeInTheDocument();
    expect(await within(nav).findByText('Power')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Briefing' })).toBeInTheDocument();
  });

  it('navigates through the command palette with Ctrl+K', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/p/prg_titan/briefing');
    await screen.findByRole('heading', { level: 1, name: 'Briefing' });
    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox');
    await user.type(input, 'timel');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/p/prg_titan/timeline'));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('switches program from the palette and keeps the current screen', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/p/prg_titan/raid');
    await screen.findByRole('heading', { level: 1, name: 'RAID log' });
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'lumen');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/p/prg_lumen/raid'));
  });

  it('redirects a guest away from a program they cannot see', async () => {
    const { api, router } = renderApp('/p/prg_titan/briefing');
    await screen.findByRole('heading', { level: 1, name: 'Briefing' });
    await router.navigate('/p/prg_lumen/briefing');
    await api.session.switchPersona('per_chris');
    await waitFor(() => expect(router.state.location.pathname).toBe('/p/prg_titan/briefing'));
  });

  it('shows not found for unknown paths', async () => {
    renderApp('/nowhere');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
