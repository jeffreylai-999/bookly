import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable } from 'rxjs';

@Service()
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}
