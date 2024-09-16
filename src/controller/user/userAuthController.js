import User from "../../model/user/userModel.js";
const userAuthController = async (req, res) => {
  const data = await req.body;
  const response = await User.findOne({
    email: data.email,
    password: data.password,
    _id: data._id,
  });
  if (response) {
    res.send("user login successfully");
  } else {
    res.send("user login failed");
  }
};
export default userAuthController;
