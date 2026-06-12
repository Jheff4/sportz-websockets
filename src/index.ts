import express, { Request, Response } from 'express';
import { matchRouter } from './routes/matches.js';

const app = express();
const PORT = 8000;

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send({ message: 'Sportz server is running!' });
});

app.use('/matches', matchRouter);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
