import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { App } from './app';
import { appConfig } from './app.config';

describe('Application shell and routing', () => {
  async function setup(url = '/') {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: appConfig.providers,
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl(url);
    await fixture.whenStable();

    return { fixture, router, element: fixture.nativeElement as HTMLElement };
  }

  it('creates the standalone application and redirects to overview', async () => {
    const { fixture, router, element } = await setup();
    expect(fixture.componentInstance).toBeTruthy();
    expect(router.url).toBe('/overview');
    expect(element.querySelector('h1')?.textContent).toBe('Overview');
    expect(element.querySelector('header')).not.toBeNull();
    expect(element.querySelector('main')).not.toBeNull();
  });

  const pages = [
    { path: '/overview', heading: 'Overview' },
    { path: '/tenants', heading: 'Tenants' },
    { path: '/global-mappings', heading: 'Global mappings' },
    { path: '/canonical-schemas', heading: 'Canonical schemas' },
  ] as const;

  for (const page of pages) {
    it(`loads ${page.path} directly with a title and active navigation`, async () => {
      const { element } = await setup(page.path);
      expect(element.querySelector('h1')?.textContent).toBe(page.heading);
      expect(TestBed.inject(Title).getTitle()).toBe(`${page.heading} | iPaaS`);
      const activeLinks = element.querySelectorAll('nav a[aria-current="page"]');
      expect(activeLinks).toHaveLength(1);
      expect(activeLinks[0]?.getAttribute('href')).toBe(page.path);
    });
  }

  it('shows the not-found page inside the shell and offers a working return link', async () => {
    const { fixture, router, element } = await setup('/missing/page');
    expect(element.querySelector('h1')?.textContent).toContain('This page isn’t here.');
    expect(element.querySelector('nav')).not.toBeNull();
    expect(element.querySelector('nav a[aria-current]')).toBeNull();
    element.querySelector<HTMLAnchorElement>('main a')?.click();
    await fixture.whenStable();
    expect(router.url).toBe('/overview');
  });

  it('opens navigation and restores toggle focus when Escape closes it', async () => {
    const { fixture, element } = await setup();
    const toggle = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="primary-navigation"]',
    );
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    toggle?.click();
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('app-sidebar')?.classList.contains('is-open')).toBe(true);

    element.querySelector('nav a')?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }),
    );
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('closes navigation and focuses the main content after following a route', async () => {
    const { fixture, router, element } = await setup();
    element.querySelector<HTMLButtonElement>('button[aria-controls]')?.click();
    await fixture.whenStable();
    element.querySelector<HTMLAnchorElement>('nav a[href="/tenants"]')?.click();
    await fixture.whenStable();

    expect(router.url).toBe('/tenants');
    expect(element.querySelector('button[aria-controls]')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(document.activeElement).toBe(element.querySelector('main'));
  });

  it('closes navigation when selecting the current route', async () => {
    const { fixture, element } = await setup('/tenants');
    element.querySelector<HTMLButtonElement>('button[aria-controls]')?.click();
    await fixture.whenStable();
    element.querySelector<HTMLAnchorElement>('nav a[href="/tenants"]')?.click();
    await fixture.whenStable();

    expect(element.querySelector('button[aria-controls]')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(document.activeElement).toBe(element.querySelector('main'));
  });

  it('skips to main content without leaving the current feature route', async () => {
    const { fixture, router, element } = await setup('/tenants');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    element.querySelector('.skip-link')?.dispatchEvent(click);
    await fixture.whenStable();

    expect(click.defaultPrevented).toBe(true);
    expect(router.url).toBe('/tenants');
    expect(document.activeElement).toBe(element.querySelector('main'));
  });
  it('provides a skip link to the focusable main landmark', async () => {
    const { element } = await setup();
    expect(element.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(element.querySelector('main')?.getAttribute('id')).toBe('main-content');
    expect(element.querySelector('main')?.getAttribute('tabindex')).toBe('-1');
  });
});
