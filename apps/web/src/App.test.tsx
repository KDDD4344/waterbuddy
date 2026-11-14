import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { addLog, completeOnboarding, deleteEverything, updateProfile } from './data/repo';
import { db } from './data/db';

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

    await user.click(await screen.findByRole('button', { name: 'Log 250 ml, Steel tumbler' }));
    expect(await within(stat).findByText(/250 millilitres of 2 litres, 12 percent/)).toBeInTheDocument();
    // The toast fills in just after the tap; slower machines (CI) need the wait.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('250 ml logged. 250 ml of 2 L.'));

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
    await user.click(await screen.findByRole('button', { name: 'Log 500 ml, Bottle' }));
    await user.click(await screen.findByRole('button', { name: /500 ml Bottle Edit/ }));
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
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved for tomorrow. Nothing lost.'));

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

describe('Phase 4 night voyage and postcards', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function startedYesterday(drankMl: number) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    y.setHours(9, 0, 0, 0);
    await completeOnboarding(
      { ageBand: '18-64', goalMl: 2000, goalSource: 'suggested', units: 'ml', cupMl: 240, parentConfirmed: false, vessels: [{ name: 'Tumbler', ml: 250 }] },
      y
    );
    if (drankMl) await addLog(drankMl, null, new Date(y.getTime() + 60 * 60 * 1000));
  }

  it('a goal day brings a message in a bottle the next morning, which opens a postcard', async () => {
    await startedYesterday(2000);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'A message washed up. Open it' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Postcard 1 of 6' })).toBeInTheDocument();
    expect(within(sheet).getByText('Loktak Lake')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Turn it over' }));
    expect(within(sheet).getByText(/The islands here float!/)).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: /Ramsar Sites Information Service/ })).toHaveAttribute('href', 'https://rsis.ramsar.org/ris/463');
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: /message washed up/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Journal' }));
    expect(await screen.findByText(/1 of 6 · Ripple sends a card/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loktak Lake' })).toBeInTheDocument();
  });

  it('a day under the goal brings no bottle and no mention', async () => {
    await startedYesterday(1500);
    render(<App />);
    expect(await screen.findByLabelText("Today's progress")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /message washed up/ })).not.toBeInTheDocument();
  });

  it('after last call Today stops counting down: "More tomorrow"', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const late = new Date();
    late.setHours(21, 30, 0, 0);
    vi.setSystemTime(late);
    await startedYesterday(0);
    render(<App />);
    const stat = await screen.findByLabelText("Today's progress");
    expect(await within(stat).findByText(/last call was 8:30 pm\. More tomorrow\./i)).toBeInTheDocument();
    expect(within(stat).queryByText(/to go/)).not.toBeInTheDocument();
  });

  it('reaching the goal says so, and Ripple will send a postcard', async () => {
    await startedYesterday(0);
    await addLog(2000);
    render(<App />);
    const stat = await screen.findByLabelText("Today's progress");
    expect(await within(stat).findByText(/Goal reached · 100% · Ripple sets off tonight/)).toBeInTheDocument();
  });
});

describe('V1 Atlas: Ripple’s spring', () => {
  it('without 3D it says so, still pours exactly one glass, and shows today’s quest', async () => {
    const y = new Date();
    y.setDate(y.getDate() - 2);
    await completeOnboarding(
      { ageBand: '18-64', goalMl: 2000, goalSource: 'suggested', units: 'ml', cupMl: 240, parentConfirmed: false, vessels: [{ name: 'Tumbler', ml: 250 }] },
      y
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Atlas' }));
    expect(await screen.findByRole('heading', { name: 'The spring' })).toBeInTheDocument();
    // jsdom has no WebGL: the still picture stays and the screen explains why.
    expect(screen.getByText(/can’t show 3D graphics/)).toBeInTheDocument();
    expect(within(screen.getByLabelText('Today’s quest')).getByText('0 of 4')).toBeInTheDocument();
    // An accidental double tap logs one glass, not two.
    await user.dblClick(screen.getByRole('button', { name: 'Pour 250 ml' }));
    expect(await screen.findByText(/250 ml logged\. 250 ml of 2 L\./)).toBeInTheDocument();
    await waitFor(async () => expect((await db.logs.toArray()).map((l) => l.ml)).toEqual([250]));
  });
});

describe('Phase 8 every age and privacy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function startAs(ageBand: '4-8' | '14-17' | '18-64' | '65+', extra: Record<string, unknown> = {}) {
    await completeOnboarding({
      ageBand,
      goalMl: 1500,
      goalSource: 'custom',
      units: 'ml',
      cupMl: 240,
      parentConfirmed: ageBand === '4-8',
      vessels: [{ name: 'Tumbler', ml: 250 }]
    });
    if (Object.keys(extra).length) await updateProfile(extra);
  }

  it('shows the privacy notice before setting up', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'How your data is handled' }));
    const dialog = screen.getByRole('dialog', { name: 'Privacy' });
    expect(within(dialog).getByRole('heading', { name: 'The short version' })).toBeInTheDocument();
    expect(within(dialog).getByText(/waiting for a legal check/)).toBeInTheDocument();
  });

  it('in kid mode, changing the goal asks a grown-up question first', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // "six times three"
    await startAs('4-8');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'You' }));
    await user.click(screen.getByRole('button', { name: 'Change' }));
    const gate = screen.getByRole('dialog', { name: 'Ask a grown-up' });
    const answer = within(gate).getByRole('textbox', { name: 'What is six times three?' });
    await user.type(answer, '17');
    await user.click(within(gate).getByRole('button', { name: 'Continue' }));
    expect(within(gate).getByRole('alert')).toHaveTextContent('Not quite');
    expect(screen.queryByRole('dialog', { name: 'Daily goal' })).not.toBeInTheDocument();
    await user.type(within(gate).getByRole('textbox', { name: 'What is six times three?' }), '18');
    await user.click(within(gate).getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('dialog', { name: 'Daily goal' })).toBeInTheDocument();
  });

  it('adults change the goal without a question', async () => {
    await startAs('18-64');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'You' }));
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(await screen.findByRole('dialog', { name: 'Daily goal' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Ask a grown-up' })).not.toBeInTheDocument();
  });

  it('older adults start with large text, and anyone can change it', async () => {
    await startAs('65+');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'You' }));
    await waitFor(() => expect(document.documentElement.dataset.text).toBe('large'));
    await user.selectOptions(screen.getByRole('combobox', { name: /Text size/ }), 'larger');
    await waitFor(() => expect(document.documentElement.dataset.text).toBe('larger'));
    await user.click(screen.getByRole('checkbox', { name: /High contrast/ }));
    await waitFor(() => expect(document.documentElement.dataset.contrast).toBe('high'));
  });

  it('under 18, reminders stay off and an old server reminder is deleted', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await startAs('14-17', { reminders: { on: true, time: '09:00', id: 'device-id-abcdefghijklmn' } });
    const user = userEvent.setup();
    render(<App />);
    await waitFor(async () => expect((await db.profile.get('me'))?.reminders?.on).toBe(false));
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls.some(([url, init]) => url.endsWith('/reminders/device-id-abcdefghijklmn') && init?.method === 'DELETE')).toBe(true);
    expect(calls.some(([url]) => url.endsWith('/today'))).toBe(false);

    await user.click(await screen.findByRole('button', { name: 'You' }));
    expect(screen.getByText(/under 18, WaterBuddy keeps everything on this phone/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on daily reminder' })).not.toBeInTheDocument();
  });
});
