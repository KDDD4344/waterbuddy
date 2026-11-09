import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { deleteEverything } from './data/repo';

beforeEach(async () => {
  await deleteEverything();
});

async function onboard(user: ReturnType<typeof userEvent.setup>, ageLabel = '18 to 64') {
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Let’s set up' }));
  await user.click(screen.getByRole('radio', { name: new RegExp(ageLabel) }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('spinbutton', { name: 'Daily goal in millilitres' })).toHaveValue(2000);
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('button', { name: 'Start filling' }));
}

describe('Phase 1 tracker', () => {
  it('onboards, logs with one tap, and undoes', async () => {
    const user = userEvent.setup();
    await onboard(user);

    const stat = await screen.findByLabelText("Today's progress");
    expect(within(stat).getByText(/0 millilitres of 2 litres/)).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Log 250 millilitres, Steel tumbler' }));
    expect(await within(stat).findByText(/250 millilitres of 2 litres, 12 percent/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('250 ml logged. 250 ml of 2 L.');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await within(stat).findByText(/0 millilitres of 2 litres/)).toBeInTheDocument();
  });

  it('asks a parent to confirm for young children', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Let’s set up' }));
    await user.click(screen.getByRole('radio', { name: /4 to 8/ }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /parent or guardian/ }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('requires confirming an unusually high goal', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Let’s set up' }));
    await user.click(screen.getByRole('radio', { name: /18 to 64/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const input = screen.getByRole('spinbutton', { name: 'Daily goal in millilitres' });
    await user.clear(input);
    await user.type(input, '4500');
    expect(screen.getByRole('alert')).toHaveTextContent(/a lot more than usual/);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Use this goal anyway' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('edits an entry', async () => {
    const user = userEvent.setup();
    await onboard(user);
    await user.click(await screen.findByRole('button', { name: 'Log 500 millilitres, Bottle' }));
    await user.click(await screen.findByRole('button', { name: /500 millilitres, Bottle\. Edit/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit this drink' });
    const amount = within(dialog).getByRole('spinbutton', { name: 'Amount (ml)' });
    await user.clear(amount);
    await user.type(amount, '400');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    const stat = screen.getByLabelText("Today's progress");
    expect(await within(stat).findByText(/400 millilitres of 2 litres/)).toBeInTheDocument();
  });
});

describe('Phase 3 field tasks and journal', () => {
  it('finishes a field task from Today and presses its sticker into the Journal', async () => {
    const user = userEvent.setup();
    await onboard(user);

    await user.click(await screen.findByRole('button', { name: /Field task 1 of 14/ }));
    const sheet = await screen.findByRole('dialog');
    const first = within(sheet).getAllByRole('radio')[0]!;
    await user.click(first);
    expect(within(sheet).getByText(/I'll fill my glass too/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Set this cue' }));

    expect(await within(sheet).findByRole('heading', { name: 'Pressed into your journal' })).toBeInTheDocument();
    expect(within(sheet).getByRole('img', { name: 'Pressed leaf sticker' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(await screen.findByText(/Field task done. Your cue:/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Journal' }));
    expect(await screen.findByText('1 of 14 pressed in')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pressed leaf sticker' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Drink history' })).toBeInTheDocument();
  });

  it('"Not today" costs nothing and keeps the task for tomorrow', async () => {
    const user = userEvent.setup();
    await onboard(user);

    await user.click(await screen.findByRole('button', { name: /Field task 1 of 14/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Not today' }));
    expect(await screen.findByText('Field task saved for tomorrow. Nothing lost.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved for tomorrow. Nothing lost.');

    await user.click(screen.getByRole('button', { name: 'Journal' }));
    expect(await screen.findByText('0 of 14 pressed in')).toBeInTheDocument();
  });

  it('keeps a line a day in the journal', async () => {
    const user = userEvent.setup();
    await onboard(user);
    await user.click(await screen.findByRole('button', { name: 'Journal' }));
    const box = await screen.findByRole('textbox', { name: 'Today' });
    await user.type(box, 'Hot day, carried my bottle everywhere.');
    await user.click(screen.getByRole('button', { name: 'Save line' }));
    expect(await screen.findByText('Line saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save line' })).toBeDisabled();
  });
});
