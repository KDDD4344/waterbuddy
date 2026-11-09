import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App shell', () => {
  it('shows the wordmark and the foundations checklist', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'WaterBuddy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Foundations check' })).toBeInTheDocument();
    expect(screen.getByText('Installed as an app')).toBeInTheDocument();
    expect(await screen.findByText('Not connected in this build')).toBeInTheDocument();
  });

  it('gives Pip a text description', () => {
    render(<App />);
    expect(screen.getByRole('img', { name: /Pip the hermit crab/ })).toBeInTheDocument();
  });
});
