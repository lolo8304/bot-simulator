exports.conversation = function () {
  return {
    object: function () {
      return [
        require("./examples/example1.json"),
        require("./examples/example2.json"),
        require("./examples/example3.json"),
        require("./examples/example4.json"),
        require("./examples/example5.json")
      ]
    }

  }
};