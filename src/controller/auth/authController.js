import User from "../../model/user/userModel.js";
const authAdminController = async (req, res) => {
  const data = await req.body;
  const response = await User.findOne(data);
  const fianlData = (await response.phoneNumber) == process.env.ADMIN_PHONE;
  const finalDatas = (await response.password) == process.env.ADMIN_PASSWORD;
  if (finalDatas ) {
    res.send(true);
  } else {
    res.send(false);
  }
};
export { authAdminController };
