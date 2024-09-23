import Product from "../../model/product/productUploadModel.js";
const productFinderController = async (req, res) => {
  const data = await req.body.id;
  const response = await Product.findById(data);
  res.send(response);
};
const productFinderSingleController = async (req, res) => {
    const response = await Product.find({});
  res.send(response);
};

export { productFinderController,productFinderSingleController };
