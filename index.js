import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import dataBase from "./src/database/dataBase.js";
import ProductUploadRoute from "./src/routes/product/ProductUploadRoute.js";
import productShowList from "./src/routes/product/productShowList.js";
import userRoute from "./src/routes/user/userRoute.js";
import userAuthRoute from "./src/routes/user/userAuthRoute.js";
import productFinder from "./src/routes/product/productFinder.js";
import cart_like from "./src/routes/Cart__Like/cart_like.js";
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/product", productShowList);
app.use("/upload", ProductUploadRoute);
app.use("/register", userRoute);
app.use("/auth", userAuthRoute);
app.use("/find", productFinder);
app.use("/shoping", cart_like);

dataBase(
  app.listen(3000, () => {
    console.log("server is running on port 3000");
  })
);
