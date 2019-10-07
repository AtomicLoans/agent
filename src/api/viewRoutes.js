exports.index = function(req, res){
  res.render('index', { mnemonic: process.env.MNEMONIC });
};

exports.verify = function(req, res){
  res.render('verify', { mnemonic: process.env.MNEMONIC });
};
