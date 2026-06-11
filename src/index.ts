import express, { Request, Response } from 'express';

const app = express();
const PORT = 8000;

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Sportz server is running!' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
