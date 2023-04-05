import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Storage } from '@ionic/storage';
import { createHash } from 'sha1-uint8array';
import { of } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';

import { UserData } from './user-data';


@Injectable({
  providedIn: 'root'
})
export class PyConAPI {
  base = 'https://us.pycon.org'

  constructor(
    private http: HttpClient,
    private storage: Storage
  ) { }

  async buildRequestAuthHeaders(method, url, body): Promise<any> {
    const apiKey = await this.storage.get('key').then((value) => {return value});
    const secret = await this.storage.get('secret').then((value) => {return value});

    const timestamp = Math.round(Date.now() / 1000)
    const baseString = [
      secret,
      timestamp,
      method,
      url,
      body,
    ].join("")

    const headers = {
      'X-API-Key': apiKey,
      'X-API-Signature': createHash().update(baseString).digest("hex"),
      'X-API-Timestamp': String(timestamp),
    }

    return headers;
  }

  async patchUserData(payload: any): Promise<any> {
    const method = "PATCH";
    const url = '/2023/api/v1/user/mobile_state/';
    const body = JSON.stringify(payload);
    const headers = {"Content-Type": "application/json"}

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    this.http.patch(
      this.base + url,
      body,
      {headers: {...headers, ...authHeaders}}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to persist mobile state, ' + error)
        throw error;
      })
    ).subscribe({
      next: data => {
      },
      error: error => {
      }
    });
  }

  async syncScan(accessCode: string): Promise<any> {
    const pending = await this.storage.get('pending-scan-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-scan-' + accessCode).then((value) => {
      return value
    });

    if (pending === null) {
      console.log('Unable to sync missing ' + accessCode);
    }

    const scanData = pending.scanData.split(":");
    const _accessCode = scanData[0];
    const _validator = scanData[scanData.length - 1];

    const method = 'GET';
    const url = '/2023/api/v1/lead_retrieval/capture/?' + 'attendee_access_code=' + accessCode + "&badge_validator=" + _validator;
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);

    this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to capture lead, ' + error)
        throw error;
      })
    ).subscribe({
      next: data => {
        console.log(data['data']);
        this.storage.set('synced-scan-' + accessCode, {...data, ...pending}).then((value) => {
          this.storage.remove('pending-scan-' + accessCode).then((value) => {});
        });
      },
      error: error => {
      }
    });
  }

  async syncNote(accessCode: string): Promise<any> {
    const pending = await this.storage.get('pending-note-' + accessCode).then((value) => {
      return value
    });

    if (pending === null) {
      console.log('Unable to sync note for missing ' + accessCode);
    }

    const method = 'POST';
    const url = '/2023/api/v1/lead_retrieval/' + accessCode + "/note/";
    const body = JSON.stringify(pending);
    const headers = {"Content-Type": "application/json"}

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);

    this.http.post(
      this.base + url,
      body,
      {headers: {...headers, ...authHeaders}}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to capture lead, ' + error)
        throw error;
      })
    ).subscribe({
      next: data => {
        console.log(data);
        this.storage.remove('pending-note-' + accessCode).then((value) => {});
      },
      error: error => {
      }
    });
  }

  async getNote(accessCode): Promise<any> {
    return this.storage.get('note-' + accessCode).then((value) => {
      return value;
    })
  }

  async storeNote(accessCode: string, note: string): Promise<any> {
    const pending = await this.storage.get('pending-scan-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-scan-' + accessCode).then((value) => {
      return value
    });
    console.log(pending, synced, note);
    this.storage.set('note-' + accessCode, {accessCode: accessCode, note: note})
    this.storage.set('pending-note-' + accessCode, {accessCode: accessCode, note: note}).then((value) => {
      this.syncNote(accessCode);
    })
    if (synced != null) {
      this.storage.set('synced-scan-' + accessCode, {...synced, ...{note: true}})
    }
    if (pending != null) {
      this.storage.set('pending-scan-' + accessCode, {...pending, ...{note: true}})
    }
  }

  async fetchScan(accessCode: string): Promise<any> {
    const pending = await this.storage.get('pending-scan-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-scan-' + accessCode).then((value) => {
      return value
    });
    if (synced != null) { return synced };
    if (pending != null) { return pending };
  }

  async storeScan(accessCode: string, scanData: string): Promise<any> {
    const pending = await this.storage.get('pending-scan-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-scan-' + accessCode).then((value) => {
      return value
    });
    if (synced != null) {
      console.log('Already captured ' + accessCode)
      return;
    } else if (pending != null) {
      this.syncScan(accessCode);
      return;
    } else {
      const scanDate = new Date();
      return this.storage.set(
        'pending-scan-' + accessCode,
        {scanData: scanData, scannedAt: scanDate.toISOString()}
      ).then(() => {
        console.log('Scanned ' + accessCode);
        this.syncScan(accessCode);
      }).catch((error) => {
        console.log('SCAN FAILED ' + accessCode);
      });
    }
  }
}
