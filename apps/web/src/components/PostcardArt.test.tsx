import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PostcardPicture } from './PostcardArt';
import { ROUTE_1 } from '../domain/voyage';

describe('postcard pictures', () => {
  it('draws the placeholder until painted art exists', () => {
    const { container } = render(<PostcardPicture card={ROUTE_1[0]!} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('loads the built WebP sizes once a card has art', () => {
    const { container } = render(<PostcardPicture card={{ ...ROUTE_1[0]!, art: true }} large />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/art/postcards/loktak-800.webp');
    expect(img.getAttribute('srcset')).toContain('/art/postcards/loktak-1600.webp 1600w');
    expect(img.getAttribute('alt')).toBe(''); // the card's alt text is read out beside it
  });
});
