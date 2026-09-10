import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_CONFIG } from '../../config/app-config';
import { ROUTE_PATHS } from '../../config/navigation';

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  protected readonly config = inject(APP_CONFIG);
  protected readonly overviewPath = '/' + ROUTE_PATHS.overview;
  protected readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  readonly navigationOpen = input.required<boolean>();
  readonly toggleNavigation = output<void>();

  focusMenuButton(): void {
    this.menuButton()?.nativeElement.focus();
  }
}
