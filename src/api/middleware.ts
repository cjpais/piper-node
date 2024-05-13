export const validateAuthToken = (req: Request) => {
  if (!process.env.SECRET) {
    return true;
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.split(" ")[1];
  if (token !== process.env.SECRET) return false;

  return true;
};
