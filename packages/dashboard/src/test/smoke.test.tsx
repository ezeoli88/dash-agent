import { describe, it, expect } from 'vitest';
import { screen } from './test-utils';
import { renderWithProviders, renderWithRouterProviders } from './test-utils';

describe('test infrastructure', () => {
  it('renders a basic component', () => {
    renderWithProviders(<div>Hello Test</div>);
    expect(screen.getByText('Hello Test')).toBeInTheDocument();
  });

  it('has EventSource mock available', () => {
    expect(EventSource).toBeDefined();
    const es = new EventSource('http://test/sse');
    expect(es.url).toBe('http://test/sse');
    es.close();
  });

  it('renders with memory router wrapper', async () => {
    renderWithRouterProviders(<div>Router Ready</div>);
    expect(await screen.findByText('Router Ready')).toBeInTheDocument();
  });
});
