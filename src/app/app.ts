import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { UiToastHost } from './ui';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TranslocoPipe, UiToastHost],
  templateUrl: './app.html',
})
export class App {}
