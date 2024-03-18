Lexer.defunct = function (chr) {
  throw new Error(
    "Unexpected character at index " + (this.index - 1) + ": " + chr,
  );
};
try {
  Lexer.engineHasStickySupport = typeof /(?:)/.sticky == "boolean";
} catch (ignored) {
  Lexer.engineHasStickySupport = false;
}
try {
  Lexer.engineHasUnicodeSupport = typeof /(?:)/.unicode == "boolean";
} catch (ignored) {
  Lexer.engineHasUnicodeSupport = false;
}

function Lexer(defunct) {
  if (typeof defunct !== "function") defunct = Lexer.defunct;

  var tokens = [];
  var rules = [];
  var remove = 0;
  this.state = 0;
  this.index = 0;
  this.input = "";

  this.addRule = function (pattern, action, start) {
    var global = pattern.global;

    if (!global || (Lexer.engineHasStickySupport && !pattern.sticky)) {
      var flags = Lexer.engineHasStickySupport ? "gy" : "g";
      if (pattern.multiline) flags += "m";
      if (pattern.ignoreCase) flags += "i";
      if (Lexer.engineHasUnicodeSupport && pattern.unicode) flags += "u";
      pattern = new RegExp(pattern.source, flags);
    }

    if (Object.prototype.toString.call(start) !== "[object Array]") start = [0];

    rules.push({
      pattern: pattern,
      global: global,
      action: action,
      start: start,
    });

    return this;
  };

  this.setInput = function (input) {
    remove = 0;
    this.state = 0;
    this.index = 0;
    tokens.length = 0;
    this.input = input;
    return this;
  };

  this.lex = function () {
    if (tokens.length) return tokens.shift();

    this.reject = true;

    while (this.index <= this.input.length) {
      var matches = scan.call(this).splice(remove);
      var index = this.index;

      while (matches.length) {
        if (this.reject) {
          var match = matches.shift();
          var result = match.result;
          var length = match.length;
          this.index += length;
          this.reject = false;
          remove++;

          var token = match.action.apply(this, result);
          if (this.reject) this.index = result.index;
          else if (typeof token !== "undefined") {
            switch (Object.prototype.toString.call(token)) {
              case "[object Array]":
                tokens = token.slice(1);
                token = token[0];
              default:
                if (length) remove = 0;
                return token;
            }
          }
        } else break;
      }

      var input = this.input;

      if (index < input.length) {
        if (this.reject) {
          remove = 0;
          var token = defunct.call(this, input.charAt(this.index++));
          if (typeof token !== "undefined") {
            if (Object.prototype.toString.call(token) === "[object Array]") {
              tokens = token.slice(1);
              return token[0];
            } else return token;
          }
        } else {
          if (this.index !== index) remove = 0;
          this.reject = true;
        }
      } else if (matches.length) this.reject = true;
      else break;
    }
  };

  function scan() {
    var matches = [];
    var index = 0;

    var state = this.state;
    var lastIndex = this.index;
    var input = this.input;

    for (var i = 0, length = rules.length; i < length; i++) {
      var rule = rules[i];
      var start = rule.start;
      var states = start.length;

      if (
        !states ||
        start.indexOf(state) >= 0 ||
        (state % 2 && states === 1 && !start[0])
      ) {
        var pattern = rule.pattern;
        pattern.lastIndex = lastIndex;
        var result = pattern.exec(input);

        if (result && result.index === lastIndex) {
          var j = matches.push({
            result: result,
            action: rule.action,
            length: result[0].length,
          });

          if (rule.global) index = j;

          while (--j > index) {
            var k = j - 1;

            if (matches[j].length > matches[k].length) {
              var temple = matches[j];
              matches[j] = matches[k];
              matches[k] = temple;
            }
          }
        }
      }
    }

    return matches;
  }
}

function isNotUTF8(bytes, byteOffset, byteLength) {
  try {
    getStringFromBytes(bytes, byteOffset, byteLength, true);
  } catch (e) {
    return true;
  }
  return false;
}

function getCharLength(theByte) {
  if (0xf0 == (theByte & 0xf0)) {
    return 4;
  } else if (0xe0 == (theByte & 0xe0)) {
    return 3;
  } else if (0xc0 == (theByte & 0xc0)) {
    return 2;
  } else if (theByte == (theByte & 0x7f)) {
    return 1;
  }
  return 0;
}

function getCharCode(bytes, byteOffset, charLength) {
  var charCode = 0,
    mask = "";
  byteOffset = byteOffset || 0;
  if (bytes.length - byteOffset <= 0) {
    throw new Error("No more characters remaining in array.");
  }
  charLength = charLength || getCharLength(bytes[byteOffset]);
  if (charLength == 0) {
    throw new Error(
      bytes[byteOffset].toString(2) +
        " is not a significative" +
        " byte (offset:" +
        byteOffset +
        ").",
    );
  }

  if (1 === charLength) {
    return bytes[byteOffset];
  }
  if (bytes.length - byteOffset < charLength) {
    throw new Error(
      "Expected at least " + charLength + " bytes remaining in array.",
    );
  }

  mask = "00000000".slice(0, charLength) + 1 + "00000000".slice(charLength + 1);
  if (bytes[byteOffset] & parseInt(mask, 2)) {
    throw Error(
      "Index " +
        byteOffset +
        ": A " +
        charLength +
        " bytes" +
        " encoded char" +
        " cannot encode the " +
        (charLength + 1) +
        "th rank bit to 1.",
    );
  }
  mask = "0000".slice(0, charLength + 1) + "11111111".slice(charLength + 1);
  charCode += (bytes[byteOffset] & parseInt(mask, 2)) << (--charLength * 6);
  while (charLength) {
    if (
      0x80 !== (bytes[byteOffset + 1] & 0x80) ||
      0x40 === (bytes[byteOffset + 1] & 0x40)
    ) {
      throw Error(
        "Index " +
          (byteOffset + 1) +
          ": Next bytes of encoded char" +
          ' must begin with a "10" bit sequence.',
      );
    }
    charCode += (bytes[++byteOffset] & 0x3f) << (--charLength * 6);
  }
  return charCode;
}

function getStringFromBytes(bytes, byteOffset, byteLength, strict) {
  var charLength,
    chars = [];
  byteOffset = byteOffset | 0;
  byteLength =
    "number" === typeof byteLength
      ? byteLength
      : bytes.byteLength || bytes.length;
  for (; byteOffset < byteLength; byteOffset++) {
    charLength = getCharLength(bytes[byteOffset]);
    if (byteOffset + charLength > byteLength) {
      if (strict) {
        throw Error(
          "Index " +
            byteOffset +
            ": Found a " +
            charLength +
            " bytes encoded char declaration but only " +
            (byteLength - byteOffset) +
            " bytes are available.",
        );
      }
    } else {
      chars.push(
        String.fromCodePoint(
          getCharCode(bytes, byteOffset, charLength, strict),
        ),
      );
    }
    byteOffset += charLength - 1;
  }
  return chars.join("");
}

function getBytesForCharCode(charCode) {
  if (charCode < 128) {
    return 1;
  } else if (charCode < 2048) {
    return 2;
  } else if (charCode < 65536) {
    return 3;
  } else if (charCode < 2097152) {
    return 4;
  }
  throw new Error("CharCode " + charCode + " cannot be encoded with UTF8.");
}

function setBytesFromCharCode(charCode, bytes, byteOffset, neededBytes) {
  charCode = charCode | 0;
  bytes = bytes || [];
  byteOffset = byteOffset | 0;
  neededBytes = neededBytes || getBytesForCharCode(charCode);

  if (1 == neededBytes) {
    bytes[byteOffset] = charCode;
  } else {
    bytes[byteOffset++] =
      (parseInt("1111".slice(0, neededBytes), 2) << (8 - neededBytes)) +
      (charCode >>> (--neededBytes * 6));

    for (; neededBytes > 0; ) {
      bytes[byteOffset++] = ((charCode >>> (--neededBytes * 6)) & 0x3f) | 0x80;
    }
  }
  return bytes;
}

function setBytesFromString(string, bytes, byteOffset, byteLength, strict) {
  string = string || "";
  bytes = bytes || [];
  byteOffset = byteOffset | 0;
  byteLength =
    "number" === typeof byteLength ? byteLength : bytes.byteLength || Infinity;
  for (var i = 0, j = string.length; i < j; i++) {
    var neededBytes = getBytesForCharCode(string[i].codePointAt(0));
    if (strict && byteOffset + neededBytes > byteLength) {
      throw new Error(
        'Not enought bytes to encode the char "' +
          string[i] +
          '" at the offset "' +
          byteOffset +
          '".',
      );
    }
    setBytesFromCharCode(
      string[i].codePointAt(0),
      bytes,
      byteOffset,
      neededBytes,
      strict,
    );
    byteOffset += neededBytes;
  }
  return bytes;
}
const jsEscapeRegex =
  /\\(u\{([0-9A-Fa-f]+)\}|u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2})|([1-7][0-7]{0,2}|[0-7]{2,3})|(['"tbrnfv0\\]))|\\U([0-9A-Fa-f]{8})/g;

const usualEscapeSequences = {
  0: "\0",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  "'": "'",
  '"': '"',
  "\\": "\\",
};

const fromHex = (str) => String.fromCodePoint(parseInt(str, 16));
const fromOct = (str) => String.fromCodePoint(parseInt(str, 8));

const unescapeJs = (string) => {
  return string.replace(
    jsEscapeRegex,
    (_, __, varHex, longHex, shortHex, octal, specialCharacter, python) => {
      if (varHex !== undefined) {
        return fromHex(varHex);
      } else if (longHex !== undefined) {
        return fromHex(longHex);
      } else if (shortHex !== undefined) {
        return fromHex(shortHex);
      } else if (octal !== undefined) {
        return fromOct(octal);
      } else if (python !== undefined) {
        return fromHex(python);
      } else {
        return usualEscapeSequences[specialCharacter];
      }
    },
  );
};

const LEX_KV = 0;
const LEX_KVLIST = 1;
const LEX_VLIST = 2;
const LEX_BOOLEAN = 3;
const LEX_COVALUE = 4;
const LEX_CVALUE = 5;
const LEX_FLOAT = 6;
const LEX_INT = 7;
const LEX_KEY = 8;
const LEX_LIST = 9;
const LEX_OBJ = 10;
const LEX_QUOTE = 11;
const LEX_RB = 12;
const LEX_RCB = 13;
const LEX_TOKEN = 14;
const LEX_VALUE = 15;

const LEX_COLON = -1;
const LEX_COMMA = -2;
const LEX_LCB = -3;
const LEX_LB = -4;
const LEX_DOT = -5;

const lexMap = {
  ":": { type: LEX_COLON },
  ",": { type: LEX_COMMA },
  "{": { type: LEX_LCB },
  "}": { type: LEX_RCB },
  "[": { type: LEX_LB },
  "]": { type: LEX_RB },
  ".": { type: LEX_DOT },
};

const lexSpc = [
  [/\s*:\s*/, LEX_COLON],
  [/\s*,\s*/, LEX_COMMA],
  [/\s*{\s*/, LEX_LCB],
  [/\s*}\s*/, LEX_RCB],
  [/\s*\[\s*/, LEX_LB],
  [/\s*\]\s*/, LEX_RB],
  [/\s*\.\s*/, LEX_DOT],
];

function parseString(str) {
  str = str.replace(/\\\//, "/");
  return unescapeJs(str);
}

function getLexer(string) {
  let lexer = new Lexer();

  let col = 0;
  let row = 0;

  lexer.addRule(/"((?:\\.|[^"])*?)($|")/, (lexeme, txt) => {
    col += lexeme.length;
    return {
      type: LEX_QUOTE,
      value: parseString(txt),
      row,
      col,
      single: false,
    };
  });

  lexer.addRule(/'((?:\\.|[^'])*?)($|'|(",?[ \t]*\n))/, (lexeme, txt) => {
    col += lexeme.length;
    return { type: LEX_QUOTE, value: parseString(txt), row, col, single: true };
  });

  lexer.addRule(/[\-0-9]*\.[0-9]*([eE][\+\-]?)?[0-9]*(?:\s*)/, (lexeme) => {
    col += lexeme.length;
    return { type: LEX_FLOAT, value: parseFloat(lexeme), row, col };
  });

  lexer.addRule(/\-?[0-9]+([eE][\+\-]?)[0-9]*(?:\s*)/, (lexeme) => {
    col += lexeme.length;
    return { type: LEX_FLOAT, value: parseFloat(lexeme), row, col };
  });

  lexer.addRule(/\-?[0-9]+(?:\s*)/, (lexeme) => {
    col += lexeme.length;
    return { type: LEX_INT, value: parseInt(lexeme), row, col };
  });

  lexSpc.forEach((item) => {
    lexer.addRule(item[0], (lexeme) => {
      col += lexeme.length;
      return { type: item[1], value: lexeme, row, col };
    });
  });

  lexer.addRule(/\s/, (lexeme) => {
    if (lexeme == "\n") {
      col = 0;
      row++;
    } else {
      col += lexeme.length;
    }
  });

  lexer.addRule(/\S[ \t]*/, (lexeme) => {
    col += lexeme.length;

    let lt = LEX_TOKEN;
    let val = lexeme;

    return { type: lt, value: val, row, col };
  });

  lexer.setInput(string);

  return lexer;
}

function lexString(str, emit) {
  let lex = getLexer(str);

  let token = "";
  while ((token = lex.lex())) {
    emit(token);
  }
}

function getAllTokens(str) {
  let arr = [];
  let emit = function (i) {
    arr.push(i);
  };

  lexString(str, emit);

  return arr;
}

function extendArray(arr) {
  if (arr.peek == null) {
    Object.defineProperty(arr, "peek", {
      enumerable: false,
      value: function () {
        return this[this.length - 1];
      },
    });
  }
  if (arr.last == null) {
    Object.defineProperty(arr, "last", {
      enumerable: false,
      value: function (i) {
        return this[this.length - (1 + i)];
      },
    });
  }
}

function is(obj, prop) {
  return obj && obj.hasOwnProperty("type") && obj.type == prop;
}

function log(str) {}

function parse(text, dupKeys) {
  let stack = [];

  let tokens = [];

  extendArray(stack);
  extendArray(tokens);

  let emit = function (t) {
    tokens.push(t);
  };

  lexString(text, emit);

  if (tokens[0].type == LEX_LB && tokens.last(0).type != LEX_RB) {
    tokens.push({ type: LEX_RB, value: "]", row: -1, col: -1 });
  }

  if (tokens[0].type == LEX_LCB && tokens.last(0).type != LEX_RCB) {
    tokens.push({ type: LEX_RCB, value: "}", row: -1, col: -1 });
  }

  for (let i = 0; i < tokens.length; i++) {
    log("Shifting " + tokens[i].type);
    stack.push(tokens[i]);
    log(stack);
    log("Reducing...");
    while (reduce(stack)) {
      log(stack);
      log("Reducing...");
    }
  }

  if (stack.length == 1 && stack[0].type == LEX_KVLIST) {
    log("Pre-compile error fix 1");
    stack = [{ type: LEX_OBJ, value: stack[0].value }];
  }

  return compileOST(stack[0], dupKeys);
}

function reduce(stack) {
  let next = stack.pop();

  switch (next.type) {
    case LEX_KEY:
      if (next.value.trim() == "true") {
        log("Rule 5");
        stack.push({ type: LEX_BOOLEAN, value: "true" });
        return true;
      }

      if (next.value.trim() == "false") {
        log("Rule 6");
        stack.push({ type: LEX_BOOLEAN, value: "false" });
        return true;
      }

      if (next.value.trim() == "null") {
        log("Rule 7");
        stack.push({ type: LEX_VALUE, value: null });
        return true;
      }
      break;

    case LEX_TOKEN:
      if (is(stack.peek(), LEX_KEY)) {
        log("Rule 11a");
        stack.peek().value += next.value;
        return true;
      }

      log("Rule 11c");
      stack.push({ type: LEX_KEY, value: next.value });
      return true;

    case LEX_INT:
      if (is(next, LEX_INT) && is(stack.peek(), LEX_KEY)) {
        log("Rule 11b");
        stack.peek().value += next.value;
        return true;
      }

      log("Rule 11f");
      next.type = LEX_VALUE;
      stack.push(next);
      return true;

    case LEX_QUOTE:
      log("Rule 11d");
      next.type = LEX_VALUE;
      next.value = next.value;
      stack.push(next);
      return true;

    case LEX_BOOLEAN:
      log("Rule 11e");
      next.type = LEX_VALUE;

      if (next.value == "true") {
        next.value = true;
      } else {
        next.value = false;
      }

      stack.push(next);
      return true;

    case LEX_FLOAT:
      log("Rule 11g");
      next.type = LEX_VALUE;
      stack.push(next);
      return true;

    case LEX_VALUE:
      if (is(stack.peek(), LEX_COMMA)) {
        log("Rule 12");
        next.type = LEX_CVALUE;
        stack.pop();
        stack.push(next);
        return true;
      }

      if (is(stack.peek(), LEX_COLON)) {
        log("Rule 13");
        next.type = LEX_COVALUE;
        stack.pop();
        stack.push(next);
        return true;
      }

      if (is(stack.peek(), LEX_KEY) && is(stack.last(1), LEX_VALUE)) {
        log("Error rule 1");
        let middleVal = stack.pop();
        stack.peek().value += '"' + middleVal.value + '"';
        stack.peek().value += next.value;
        return true;
      }

      if (is(stack.peek(), LEX_KEY) && is(stack.last(1), LEX_VLIST)) {
        log("Error rule 2");
        let middleVal = stack.pop();
        let oldLastVal = stack.peek().value.pop();
        oldLastVal += '"' + middleVal.value + '"';
        oldLastVal += next.value;

        stack.peek().value.push(oldLastVal);

        return true;
      }

      if (is(stack.peek(), LEX_KEY) && is(stack.last(1), LEX_KVLIST)) {
        log("Error rule 3");
        let middleVal = stack.pop();
        let oldLastVal = stack.peek().value.pop();
        const qChar = next.single ? "'" : '"';

        oldLastVal.value += qChar + middleVal.value + qChar;
        oldLastVal.value += next.value;

        stack.peek().value.push(oldLastVal);

        return true;
      }

      if (is(stack.peek(), LEX_KEY)) {
        log("Error rule 4");
        let keyValue = stack.pop().value;
        next.value = keyValue + next.value;
        stack.push(next);
        return true;
      }

      break;

    case LEX_LIST:
      if (is(next, LEX_LIST) && is(stack.peek(), LEX_COMMA)) {
        log("Rule 12a");
        next.type = LEX_CVALUE;
        stack.pop();
        stack.push(next);
        return true;
      }

      if (is(stack.peek(), LEX_COLON)) {
        log("Rule 13a");
        next.type = LEX_COVALUE;
        stack.pop();
        stack.push(next);
        return true;
      }
      break;

    case LEX_OBJ:
      if (is(stack.peek(), LEX_COMMA)) {
        log("Rule 12b");
        let toPush = { type: LEX_CVALUE, value: next };
        stack.pop();
        stack.push(toPush);
        return true;
      }

      if (is(stack.peek(), LEX_COLON)) {
        log("Rule 13b");
        let toPush = { type: LEX_COVALUE, value: next };
        stack.pop();
        stack.push(toPush);
        return true;
      }

      if (is(stack.peek(), LEX_KEY)) {
        log("Error rule 9");
        let key = stack.pop();
        stack.push({ type: LEX_KV, key: key.value.trim(), value: next });
        return true;
      }

      break;

    case LEX_CVALUE:
      if (is(stack.peek(), LEX_VLIST)) {
        log("Rule 14");
        stack.peek().value.push(next.value);
        return true;
      }

      log("Rule 15");
      stack.push({ type: LEX_VLIST, value: [next.value] });
      return true;

    case LEX_VLIST:
      if (is(stack.peek(), LEX_VALUE)) {
        log("Rule 15a");
        next.value.unshift(stack.peek().value);
        stack.pop();
        stack.push(next);
        return true;
      }

      if (is(stack.peek(), LEX_LIST)) {
        log("Rule 15b");
        next.value.unshift(stack.peek().value);
        stack.pop();
        stack.push(next);
        return true;
      }

      if (is(stack.peek(), LEX_OBJ)) {
        log("Rule 15c");
        next.value.unshift(stack.peek());
        stack.pop();
        stack.push(next);
        return true;
      }

      if (is(stack.peek(), LEX_KEY) && (stack.last(1), LEX_COMMA)) {
        log("Error rule 7");
        let l = stack.pop();
        stack.push({ type: LEX_VALUE, value: l.value });
        log("Start subreduce... (" + l.value + ")");
        while (reduce(stack));
        log("End subreduce");
        stack.push(next);

        return true;
      }

      if (is(stack.peek(), LEX_VLIST)) {
        log("Error rule 8");
        stack.peek().value.push(next.value[0]);
        return true;
      }
      break;

    case LEX_COVALUE:
      if (
        is(stack.peek(), LEX_KEY) ||
        is(stack.peek(), LEX_VALUE) ||
        is(stack.peek(), LEX_VLIST)
      ) {
        log("Rule 16");
        let key = stack.pop();
        stack.push({ type: LEX_KV, key: key.value, value: next.value });
        return true;
      }

      throw new Error(
        "Got a :value that can't be handled at line " +
          next.row +
          ":" +
          next.col,
      );

    case LEX_KV:
      if (is(stack.last(0), LEX_COMMA) && is(stack.last(1), LEX_KVLIST)) {
        log("Rule 17");
        stack.last(1).value.push(next);
        stack.pop();
        return true;
      }

      log("Rule 18");
      stack.push({ type: LEX_KVLIST, value: [next] });
      return true;

    case LEX_KVLIST:
      if (is(stack.peek(), LEX_KVLIST)) {
        log("Rule 17a");
        next.value.forEach(function (i) {
          stack.peek().value.push(i);
        });
        return true;
      }

      break;

    case LEX_RB:
      if (is(stack.peek(), LEX_VLIST) && is(stack.last(1), LEX_LB)) {
        log("Rule 19");
        let l = stack.pop();
        stack.pop();
        stack.push({ type: LEX_LIST, value: l.value });
        return true;
      }

      if (is(stack.peek(), LEX_LIST) && is(stack.last(1), LEX_LB)) {
        log("Rule 19b");
        let l = stack.pop();
        stack.pop();
        stack.push({ type: LEX_LIST, value: [l.value] });
        return true;
      }

      if (is(stack.peek(), LEX_LB)) {
        log("Rule 22");
        stack.pop();
        stack.push({ type: LEX_LIST, value: [] });
        return true;
      }

      if (is(stack.peek(), LEX_VALUE) && is(stack.last(1), LEX_LB)) {
        log("Rule 23");
        let val = stack.pop().value;
        stack.pop();
        stack.push({ type: LEX_LIST, value: [val] });
        return true;
      }

      if (is(stack.peek(), LEX_OBJ) && is(stack.last(1), LEX_LB)) {
        log("Rule 23b");
        let val = stack.pop();
        stack.pop();
        stack.push({ type: LEX_LIST, value: [val] });
        return true;
      }

      if (is(stack.peek(), LEX_KEY) && is(stack.last(1), LEX_COMMA)) {
        log("Error rule 5");
        let l = stack.pop();
        stack.push({ type: LEX_VALUE, value: l.value });
        log("Start subreduce... (" + l.value + ")");
        while (reduce(stack));
        log("End subreduce");
        stack.push({ type: LEX_RB });
        return true;
      }

      if (
        is(stack.peek(), LEX_COMMA) &&
        (is(stack.last(1), LEX_KEY) ||
          is(stack.last(1), LEX_OBJ) ||
          is(stack.last(1), LEX_VALUE))
      ) {
        log("Error rule 5a");
        stack.pop();

        stack.push({ type: LEX_RB, value: "]" });
        log("Start subreduce...");
        log("Content: " + JSON.stringify(stack));
        while (reduce(stack));
        log("End subreduce");

        return true;
      }

      if (is(stack.peek(), LEX_KEY) && is(stack.last(1), LEX_LB)) {
        log("Error rule 5b");
        let v = stack.pop();
        stack.pop();
        stack.push({ type: LEX_LIST, value: [v.value] });
        return true;
      }

      if (is(stack.peek(), LEX_COMMA) && is(stack.last(1), LEX_VLIST)) {
        log("Error rule 5c");
        stack.pop();
        stack.push({ type: LEX_RB });
        log("Start subreduce...");
        log("Content: " + JSON.stringify(stack));
        while (reduce(stack));
        log("End subreduce");

        return true;
      }

      break;

    case LEX_RCB:
      if (is(stack.peek(), LEX_KVLIST) && is(stack.last(1), LEX_LCB)) {
        log("Rule 20");
        let l = stack.pop();
        stack.pop();
        stack.push({ type: LEX_OBJ, value: l.value });
        return true;
      }

      if (is(stack.peek(), LEX_LCB)) {
        log("Rule 21");
        stack.pop();
        stack.push({ type: LEX_OBJ, value: null });
        return true;
      }

      if (is(stack.peek(), LEX_KEY) && is(stack.last(1), LEX_COLON)) {
        log("Error rule 4a");
        let l = stack.pop();
        stack.push({ type: LEX_VALUE, value: l.value });
        log("Start subreduce... (" + l.value + ")");
        while (reduce(stack));
        log("End subreduce");
        stack.push({ type: LEX_RCB });
        return true;
      }

      if (is(stack.peek(), LEX_COLON)) {
        log("Error rule 4b");
        stack.push({ type: LEX_VALUE, value: null });

        log("Starting subreduce...");
        while (reduce(stack));
        log("End subreduce.");

        stack.push({ type: LEX_RCB });
        return true;
      }

      if (is(stack.peek(), LEX_COMMA)) {
        log("Error rule 10a");
        stack.pop();
        stack.push({ type: LEX_RCB });
        return true;
      }

      throw new Error(
        "Found } that I can't handle at line " + next.row + ":" + next.col,
      );

    case LEX_COMMA:
      if (is(stack.peek(), LEX_COMMA)) {
        log("Comma error rule 1");

        return true;
      }

      if (is(stack.peek(), LEX_KEY)) {
        log("Comma error rule 2");
        const key = stack.pop();
        stack.push({ type: LEX_VALUE, value: key.value });

        log("Starting subreduce...");
        while (reduce(stack));
        log("End subreduce.");

        stack.push(next);
        return true;
      }

      if (is(stack.peek(), LEX_COLON)) {
        log("Comma error rule 3");
        stack.push({ type: LEX_VALUE, value: null });

        log("Starting subreduce...");
        while (reduce(stack));
        log("End subreduce.");

        stack.push(next);
        return true;
      }
  }

  stack.push(next);
  return false;
}

function compileOST(tree, dupKeys) {
  let rawTypes = ["boolean", "number", "string"];

  if (rawTypes.indexOf(typeof tree) != -1) return tree;

  if (tree === null) return null;

  if (Array.isArray(tree)) {
    let toR = [];
    while (tree.length > 0) toR.unshift(compileOST(tree.pop()));
    return toR;
  }

  if (is(tree, LEX_OBJ)) {
    let toR = {};
    if (tree.value === null) return {};
    tree.value.forEach(function (i) {
      const key = i.key;
      const val = compileOST(i.value);

      if (dupKeys && key in toR) {
        toR[key] = {
          value: toR[key],
          next: val,
        };
      } else {
        toR[key] = val;
      }
    });
    return toR;
  }

  if (is(tree, LEX_LIST)) {
    return compileOST(tree.value);
  }

  return tree.value;
}
function JSONDparse(text, config) {
  let fallback = true;
  let duplicateKeys = false;

  if (config) {
    if ("fallback" in config && config[fallback] === false) {
      fallback = false;
    }

    duplicateKeys =
      "duplicateKeys" in config && config["duplicateKeys"] === true;
  }

  try {
    return parse(text, duplicateKeys);
  } catch (e) {
    if (fallback === false) {
      throw e;
    }

    try {
      let json = JSON.parse(text);

      console.warn(
        "dirty-json got valid JSON that failed with the custom parser. We're returning the valid JSON, but please file a bug report here: https://github.com/RyanMarcus/dirty-json/issues  -- the JSON that caused the failure was: " +
          text,
      );

      return json;
    } catch (json_error) {
      throw e;
    }
  }
}
