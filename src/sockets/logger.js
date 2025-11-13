export const log = (emoji, message, data = null) => {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${emoji} ${message}`);
  if (data) console.log(data);
};