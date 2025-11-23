import jwt from "jsonwebtoken";

export const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("jwt", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: "none", // cross-site cookie allowed
    secure: true, // CHANGED: Always true for production (Render uses HTTPS)
    path: '/', // Ensure cookie is available on all paths
  });

  return token;
};