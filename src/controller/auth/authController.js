import User from "../../model/user/userModel.js";
const authAdminController = async (req, res) => {
  const data = await req.body;
    const response = await User.findOne(data);
  if (
    response.phoneNumber == process.env.ADMIN_PHONE &&
    response.password === process.env.ADMIN_PASSWORD
  ) {
    res.send(true);
  } else {
    res.send(false);
  }
};
export { authAdminController };
