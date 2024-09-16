import User from "../../model/user/userModel.js";
const userRegisterController = async (req, res) => {
  const data = await req.body;
  const findData = await User.findOne({ phoneNumber: data.phoneNumber });
  if (findData) {
    res.send("User already exist");
  } else {
    const newRegister = await new User(data);
    const saveData = await newRegister.save();
    res.send(saveData);
  }
};
const userLoginController = async (req, res) => {
  const data = await req.body;
  const resPhoneNumber = await User.findOne({ phoneNumber: data.phoneNumber });
  if (resPhoneNumber) {
    const resPassword = await User.findOne({ password: data.password });
    if (resPassword) {
      const resAuth = await User.findOne({ password: data.password });
      res.send(resAuth);
    } else {
      res.send("Password is incorrect");
    }
  } else {
    res.send("Phone number is incorrect");
  }
};
export { userRegisterController, userLoginController };
