export interface Question {
  question: string;
  answers: string[];
  correctAnswer: string;
}

export interface MinimalDataConnection {
  send(data: any): void;
  close(): void;
  on(event: string, cb: () => void): void;
  on(event: 'data', cb: (data: any) => void): void;
  on(event: 'open', cb: () => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (err: any) => void): void;
  peer: string;
}

export interface Player {
  displayName: string;
  answerIndexes: number[];
  response?: number;
  conn: MinimalDataConnection;
	self?: true
}
