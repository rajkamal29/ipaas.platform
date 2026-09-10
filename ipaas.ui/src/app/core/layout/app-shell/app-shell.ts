import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationSkipped, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Header } from '../header/header';
import { Sidebar } from '../sidebar/sidebar';

@Component({
  selector: 'app-shell',
  imports: [Header, Sidebar, RouterOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'closeNavigation()' },
})
export class AppShell {
  protected readonly navigationOpen = signal(false);
  private readonly header = viewChild(Header);
  private readonly mainContent = viewChild<ElementRef<HTMLElement>>('mainContent');
  private readonly injector = inject(Injector);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd || event instanceof NavigationSkipped),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.navigationOpen.set(false);
        afterNextRender(() => this.mainContent()?.nativeElement.focus({ preventScroll: true }), {
          injector: this.injector,
        });
      });
  }

  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.mainContent()?.nativeElement.focus();
  }
  protected closeNavigation(): void {
    if (this.navigationOpen()) {
      this.navigationOpen.set(false);
      this.header()?.focusMenuButton();
    }
  }
}
