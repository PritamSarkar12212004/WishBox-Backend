import Product from "../../model/product/productUploadModel.js";
const likeController = async (req, res) => {
  const data = await req.body;
  const productId = await data.data._id;
  const userId = await data.auth._id;
  const likePush = await Product.findByIdAndUpdate(productId, {
    $push: {
      likes: userId,
    },
  });
  res.send(true);
};
const likeControllerRemover = async (req, res) => {
  const data = await req.body;
  const productId = await data.data._id;
  const userId = await data.auth._id;
  const likePush = await Product.findByIdAndUpdate(productId, {
    $pull: {
      likes: userId,
    },
  });
  res.send(false);
};

const likeCheker = async (req, res) => {
  const data = await req.body;
  const productId = await data.data._id;
  const userId = await data.auth._id;
  const response = await Product.findOne({ _id: productId, likes: userId });
  if (!response) {
    res.send(false);
  } else {
    res.send(true);
  }
};
const likeCheker2 = async (req, res) => {
  const data = await req.body;
  const productId = await data.data._id;
  const userId = await data._id;
  const response = await Product.findOne({ _id: productId, likes: userId });
  if (!response) {
    res.send(false);
  } else {
    res.send(true);
  }
};
const cartController = async (req, res) => {
  const data = await req.body;
  const productId = await data.data._id;
  const userId = await data.auth._id;
  const likePush = await Product.findByIdAndUpdate(productId, {
    $push: {
      carts: userId,
    },
  });

  res.send(true);
};
const cartControllerRemover = async (req, res) => {
  const data = await req.body;
  const productId = await data.data._id;
  const userId = await data.auth._id;
  const likePush = await Product.findByIdAndUpdate(productId, {
    $pull: {
      carts: userId,
    },
  });
  res.send(false);
};

const cartCheker = async (req, res) => {
  const data = await req.body;
  const productId = await data.data._id;
  const userId = await data.auth._id;
  const response = await Product.findOne({ _id: productId, carts: userId });
  if (!response) {
    res.send(false);
  } else {
    res.send(true);
  }
};

const cartPage = async (req, res) => {
  const data = await req.body;
  const response = await Product.find({ carts: data._id });
  res.send(response);
};
const likePage = async (req, res) => {
  const data = await req.body;
  const response = await Product.find({ likes: data._id });
  res.send(response);
};

export {
  likeController,
  likeCheker,
  likeControllerRemover,
  cartController,
  cartControllerRemover,
  cartCheker,
  cartPage,
  likePage,
  likeCheker2
};
