class JSONRepairError extends Error {
  constructor(message, position) {
    super(message + " at position " + position);

    this.position = position;
  }
}

const codeBackslash = 0x5c;
const codeSlash = 0x2f;
const codeAsterisk = 0x2a;
const codeOpeningBrace = 0x7b;
const codeClosingBrace = 0x7d;
const codeOpeningBracket = 0x5b;
const codeClosingBracket = 0x5d;
const codeOpenParenthesis = 0x28;
const codeCloseParenthesis = 0x29;
const codeSpace = 0x20;
const codeNewline = 0xa;
const codeTab = 0x9;
const codeReturn = 0xd;
const codeBackspace = 0x08;
const codeFormFeed = 0x0c;
const codeDoubleQuote = 0x0022;
const codePlus = 0x2b;
const codeMinus = 0x2d;
const codeQuote = 0x27;
const codeZero = 0x30;
const codeNine = 0x39;
const codeComma = 0x2c;
const codeDot = 0x2e;
const codeColon = 0x3a;
const codeSemicolon = 0x3b;
const codeUppercaseA = 0x41;
const codeLowercaseA = 0x61;
const codeUppercaseE = 0x45;
const codeLowercaseE = 0x65;
const codeUppercaseF = 0x46;
const codeLowercaseF = 0x66;
const codeNonBreakingSpace = 0xa0;
const codeEnQuad = 0x2000;
const codeHairSpace = 0x200a;
const codeNarrowNoBreakSpace = 0x202f;
const codeMediumMathematicalSpace = 0x205f;
const codeIdeographicSpace = 0x3000;
const codeDoubleQuoteLeft = 0x201c;
const codeDoubleQuoteRight = 0x201d;
const codeQuoteLeft = 0x2018;
const codeQuoteRight = 0x2019;
const codeGraveAccent = 0x0060;
const codeAcuteAccent = 0x00b4;

function isHex(code) {
  return (
    (code >= codeZero && code <= codeNine) ||
    (code >= codeUppercaseA && code <= codeUppercaseF) ||
    (code >= codeLowercaseA && code <= codeLowercaseF)
  );
}

function isDigit(code) {
  return code >= codeZero && code <= codeNine;
}

function isValidStringCharacter(code) {
  return code >= 0x20 && code <= 0x10ffff;
}

function isDelimiter(char) {
  return regexDelimiter.test(char);
}

const regexDelimiter = /^[,:[\]/{}()\n+]$/;

function isStartOfValue(char) {
  return regexStartOfValue.test(char) || (char && isQuote(char.charCodeAt(0)));
}

const regexStartOfValue = /^[[{\w-]$/;

function isControlCharacter(code) {
  return (
    code === codeNewline ||
    code === codeReturn ||
    code === codeTab ||
    code === codeBackspace ||
    code === codeFormFeed
  );
}

function isWhitespace(code) {
  return (
    code === codeSpace ||
    code === codeNewline ||
    code === codeTab ||
    code === codeReturn
  );
}

function isSpecialWhitespace(code) {
  return (
    code === codeNonBreakingSpace ||
    (code >= codeEnQuad && code <= codeHairSpace) ||
    code === codeNarrowNoBreakSpace ||
    code === codeMediumMathematicalSpace ||
    code === codeIdeographicSpace
  );
}

function isQuote(code) {
  return isDoubleQuoteLike(code) || isSingleQuoteLike(code);
}

function isDoubleQuoteLike(code) {
  return (
    code === codeDoubleQuote ||
    code === codeDoubleQuoteLeft ||
    code === codeDoubleQuoteRight
  );
}

function isDoubleQuote(code) {
  return code === codeDoubleQuote;
}

function isSingleQuoteLike(code) {
  return (
    code === codeQuote ||
    code === codeQuoteLeft ||
    code === codeQuoteRight ||
    code === codeGraveAccent ||
    code === codeAcuteAccent
  );
}

function isSingleQuote(code) {
  return code === codeQuote;
}

function stripLastOccurrence(text, textToStrip, stripRemainingText = false) {
  const index = text.lastIndexOf(textToStrip);
  return index !== -1
    ? text.substring(0, index) +
        (stripRemainingText ? "" : text.substring(index + 1))
    : text;
}

function insertBeforeLastWhitespace(text, textToInsert) {
  let index = text.length;

  if (!isWhitespace(text.charCodeAt(index - 1))) {
    return text + textToInsert;
  }

  while (isWhitespace(text.charCodeAt(index - 1))) {
    index--;
  }

  return text.substring(0, index) + textToInsert + text.substring(index);
}

function removeAtIndex(text, start, count) {
  return text.substring(0, start) + text.substring(start + count);
}

function endsWithCommaOrNewline(text) {
  return /[,\n][ \t\r]*$/.test(text);
}

const controlCharacters = {
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

const escapeCharacters = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

function jsonrepair(text) {
  let i = 0;
  let output = "";

  const processed = parseValue();
  if (!processed) {
    throwUnexpectedEnd();
  }

  const processedComma = parseCharacter(codeComma);
  if (processedComma) {
    parseWhitespaceAndSkipComments();
  }

  if (isStartOfValue(text[i]) && endsWithCommaOrNewline(output)) {
    if (!processedComma) {
      output = insertBeforeLastWhitespace(output, ",");
    }

    parseNewlineDelimitedJSON();
  } else if (processedComma) {
    output = stripLastOccurrence(output, ",");
  }

  while (
    text.charCodeAt(i) === codeClosingBrace ||
    text.charCodeAt(i) === codeClosingBracket
  ) {
    i++;
    parseWhitespaceAndSkipComments();
  }

  if (i >= text.length) {
    return output;
  }

  throwUnexpectedCharacter();

  function parseValue() {
    parseWhitespaceAndSkipComments();
    const processed =
      parseObject() ||
      parseArray() ||
      parseString() ||
      parseNumber() ||
      parseKeywords() ||
      parseUnquotedString();
    parseWhitespaceAndSkipComments();

    return processed;
  }

  function parseWhitespaceAndSkipComments() {
    const start = i;

    let changed = parseWhitespace();
    do {
      changed = parseComment();
      if (changed) {
        changed = parseWhitespace();
      }
    } while (changed);

    return i > start;
  }

  function parseWhitespace() {
    let whitespace = "";
    let normal;
    while (
      (normal = isWhitespace(text.charCodeAt(i))) ||
      isSpecialWhitespace(text.charCodeAt(i))
    ) {
      if (normal) {
        whitespace += text[i];
      } else {
        whitespace += " ";
      }

      i++;
    }

    if (whitespace.length > 0) {
      output += whitespace;
      return true;
    }

    return false;
  }

  function parseComment() {
    if (
      text.charCodeAt(i) === codeSlash &&
      text.charCodeAt(i + 1) === codeAsterisk
    ) {
      while (i < text.length && !atEndOfBlockComment(text, i)) {
        i++;
      }
      i += 2;

      return true;
    }

    if (
      text.charCodeAt(i) === codeSlash &&
      text.charCodeAt(i + 1) === codeSlash
    ) {
      while (i < text.length && text.charCodeAt(i) !== codeNewline) {
        i++;
      }

      return true;
    }

    return false;
  }

  function parseCharacter(code) {
    if (text.charCodeAt(i) === code) {
      output += text[i];
      i++;
      return true;
    }

    return false;
  }

  function skipCharacter(code) {
    if (text.charCodeAt(i) === code) {
      i++;
      return true;
    }

    return false;
  }

  function skipEscapeCharacter() {
    return skipCharacter(codeBackslash);
  }

  function parseObject() {
    if (text.charCodeAt(i) === codeOpeningBrace) {
      output += "{";
      i++;
      parseWhitespaceAndSkipComments();

      let initial = true;
      while (i < text.length && text.charCodeAt(i) !== codeClosingBrace) {
        let processedComma;
        if (!initial) {
          processedComma = parseCharacter(codeComma);
          if (!processedComma) {
            output = insertBeforeLastWhitespace(output, ",");
          }
          parseWhitespaceAndSkipComments();
        } else {
          processedComma = true;
          initial = false;
        }

        const processedKey = parseString() || parseUnquotedString();
        if (!processedKey) {
          if (
            text.charCodeAt(i) === codeClosingBrace ||
            text.charCodeAt(i) === codeOpeningBrace ||
            text.charCodeAt(i) === codeClosingBracket ||
            text.charCodeAt(i) === codeOpeningBracket ||
            text[i] === undefined
          ) {
            output = stripLastOccurrence(output, ",");
          } else {
            throwObjectKeyExpected();
          }
          break;
        }

        parseWhitespaceAndSkipComments();
        const processedColon = parseCharacter(codeColon);
        const truncatedText = i >= text.length;
        if (!processedColon) {
          if (isStartOfValue(text[i]) || truncatedText) {
            output = insertBeforeLastWhitespace(output, ":");
          } else {
            throwColonExpected();
          }
        }
        const processedValue = parseValue();
        if (!processedValue) {
          if (processedColon || truncatedText) {
            output += "null";
          } else {
            throwColonExpected();
          }
        }
      }

      if (text.charCodeAt(i) === codeClosingBrace) {
        output += "}";
        i++;
      } else {
        output = insertBeforeLastWhitespace(output, "}");
      }

      return true;
    }

    return false;
  }

  function parseArray() {
    if (text.charCodeAt(i) === codeOpeningBracket) {
      output += "[";
      i++;
      parseWhitespaceAndSkipComments();

      let initial = true;
      while (i < text.length && text.charCodeAt(i) !== codeClosingBracket) {
        if (!initial) {
          const processedComma = parseCharacter(codeComma);
          if (!processedComma) {
            output = insertBeforeLastWhitespace(output, ",");
          }
        } else {
          initial = false;
        }

        const processedValue = parseValue();
        if (!processedValue) {
          output = stripLastOccurrence(output, ",");
          break;
        }
      }

      if (text.charCodeAt(i) === codeClosingBracket) {
        output += "]";
        i++;
      } else {
        output = insertBeforeLastWhitespace(output, "]");
      }

      return true;
    }

    return false;
  }

  function parseNewlineDelimitedJSON() {
    let initial = true;
    let processedValue = true;
    while (processedValue) {
      if (!initial) {
        const processedComma = parseCharacter(codeComma);
        if (!processedComma) {
          output = insertBeforeLastWhitespace(output, ",");
        }
      } else {
        initial = false;
      }

      processedValue = parseValue();
    }

    if (!processedValue) {
      output = stripLastOccurrence(output, ",");
    }

    output = `[\n${output}\n]`;
  }

  function parseString(stopAtDelimiter = false) {
    let skipEscapeChars = text.charCodeAt(i) === codeBackslash;
    if (skipEscapeChars) {
      i++;
      skipEscapeChars = true;
    }

    if (isQuote(text.charCodeAt(i))) {
      const isEndQuote = isDoubleQuote(text.charCodeAt(i))
        ? isDoubleQuote
        : isSingleQuote(text.charCodeAt(i))
          ? isSingleQuote
          : isSingleQuoteLike(text.charCodeAt(i))
            ? isSingleQuoteLike
            : isDoubleQuoteLike;

      const iBefore = i;
      const oBefore = output.length;

      let str = '"';
      i++;

      while (true) {
        if (i >= text.length) {
          if (!stopAtDelimiter) {
            i = iBefore;
            output = output.substring(0, oBefore);

            return parseString(true);
          }

          str = insertBeforeLastWhitespace(str, '"');
          output += str;

          return true;
        } else if (isEndQuote(text.charCodeAt(i))) {
          const iQuote = i;
          const oQuote = str.length;
          str += '"';
          i++;
          output += str;

          parseWhitespaceAndSkipComments();

          if (
            stopAtDelimiter ||
            i >= text.length ||
            isDelimiter(text.charAt(i)) ||
            isQuote(text.charCodeAt(i))
          ) {
            parseConcatenatedString();

            return true;
          }

          if (isDelimiter(text.charAt(prevNonWhitespaceIndex(iQuote - 1)))) {
            i = iBefore;
            output = output.substring(0, oBefore);

            return parseString(true);
          }

          output = output.substring(0, oBefore);
          i = iQuote + 1;

          str = str.substring(0, oQuote) + "\\" + str.substring(oQuote);
        } else if (stopAtDelimiter && isDelimiter(text[i])) {
          str = insertBeforeLastWhitespace(str, '"');
          output += str;

          parseConcatenatedString();

          return true;
        } else if (text.charCodeAt(i) === codeBackslash) {
          const char = text.charAt(i + 1);
          const escapeChar = escapeCharacters[char];
          if (escapeChar !== undefined) {
            str += text.slice(i, i + 2);
            i += 2;
          } else if (char === "u") {
            let j = 2;
            while (j < 6 && isHex(text.charCodeAt(i + j))) {
              j++;
            }

            if (j === 6) {
              str += text.slice(i, i + 6);
              i += 6;
            } else if (i + j >= text.length) {
              i = text.length;
            } else {
              throwInvalidUnicodeCharacter();
            }
          } else {
            str += char;
            i += 2;
          }
        } else {
          const char = text.charAt(i);
          const code = text.charCodeAt(i);

          if (
            code === codeDoubleQuote &&
            text.charCodeAt(i - 1) !== codeBackslash
          ) {
            str += "\\" + char;
            i++;
          } else if (isControlCharacter(code)) {
            str += controlCharacters[char];
            i++;
          } else {
            if (!isValidStringCharacter(code)) {
              throwInvalidCharacter(char);
            }
            str += char;
            i++;
          }
        }

        if (skipEscapeChars) {
          skipEscapeCharacter();
        }
      }
    }

    return false;
  }

  function parseConcatenatedString() {
    let processed = false;

    parseWhitespaceAndSkipComments();
    while (text.charCodeAt(i) === codePlus) {
      processed = true;
      i++;
      parseWhitespaceAndSkipComments();

      output = stripLastOccurrence(output, '"', true);
      const start = output.length;
      const parsedStr = parseString();
      if (parsedStr) {
        output = removeAtIndex(output, start, 1);
      } else {
        output = insertBeforeLastWhitespace(output, '"');
      }
    }

    return processed;
  }

  function parseNumber() {
    const start = i;
    if (text.charCodeAt(i) === codeMinus) {
      i++;
      if (expectDigitOrRepair(start)) {
        return true;
      }
    }

    while (isDigit(text.charCodeAt(i))) {
      i++;
    }

    if (text.charCodeAt(i) === codeDot) {
      i++;
      if (expectDigitOrRepair(start)) {
        return true;
      }
      while (isDigit(text.charCodeAt(i))) {
        i++;
      }
    }

    if (
      text.charCodeAt(i) === codeLowercaseE ||
      text.charCodeAt(i) === codeUppercaseE
    ) {
      i++;
      if (text.charCodeAt(i) === codeMinus || text.charCodeAt(i) === codePlus) {
        i++;
      }
      if (expectDigitOrRepair(start)) {
        return true;
      }
      while (isDigit(text.charCodeAt(i))) {
        i++;
      }
    }

    if (i > start) {
      const num = text.slice(start, i);
      const hasInvalidLeadingZero = /^0\d/.test(num);

      output += hasInvalidLeadingZero ? `"${num}"` : num;
      return true;
    }

    return false;
  }

  function parseKeywords() {
    return (
      parseKeyword("true", "true") ||
      parseKeyword("false", "false") ||
      parseKeyword("null", "null") ||
      parseKeyword("True", "true") ||
      parseKeyword("False", "false") ||
      parseKeyword("None", "null")
    );
  }

  function parseKeyword(name, value) {
    if (text.slice(i, i + name.length) === name) {
      output += value;
      i += name.length;
      return true;
    }

    return false;
  }

  function parseUnquotedString() {
    const start = i;
    while (
      i < text.length &&
      !isDelimiter(text[i]) &&
      !isQuote(text.charCodeAt(i))
    ) {
      i++;
    }

    if (i > start) {
      if (text.charCodeAt(i) === codeOpenParenthesis) {
        i++;

        parseValue();

        if (text.charCodeAt(i) === codeCloseParenthesis) {
          i++;
          if (text.charCodeAt(i) === codeSemicolon) {
            i++;
          }
        }

        return true;
      } else {
        while (isWhitespace(text.charCodeAt(i - 1)) && i > 0) {
          i--;
        }

        const symbol = text.slice(start, i);
        output += symbol === "undefined" ? "null" : JSON.stringify(symbol);

        if (text.charCodeAt(i) === codeDoubleQuote) {
          i++;
        }

        return true;
      }
    }
  }

  function prevNonWhitespaceIndex(start) {
    let prev = start;

    while (prev > 0 && isWhitespace(text.charCodeAt(prev))) {
      prev--;
    }

    return prev;
  }

  function expectDigit(start) {
    if (!isDigit(text.charCodeAt(i))) {
      const numSoFar = text.slice(start, i);
      throw new JSONRepairError(
        `Invalid number '${numSoFar}', expecting a digit ${got()}`,
        i,
      );
    }
  }

  function expectDigitOrRepair(start) {
    if (i >= text.length) {
      output += text.slice(start, i) + "0";
      return true;
    } else {
      expectDigit(start);
      return false;
    }
  }

  function throwInvalidCharacter(char) {
    throw new JSONRepairError("Invalid character " + JSON.stringify(char), i);
  }

  function throwUnexpectedCharacter() {
    throw new JSONRepairError(
      "Unexpected character " + JSON.stringify(text[i]),
      i,
    );
  }

  function throwUnexpectedEnd() {
    throw new JSONRepairError("Unexpected end of json string", text.length);
  }

  function throwObjectKeyExpected() {
    throw new JSONRepairError("Object key expected", i);
  }

  function throwColonExpected() {
    throw new JSONRepairError("Colon expected", i);
  }

  function throwInvalidUnicodeCharacter() {
    const chars = text.slice(i, i + 6);
    throw new JSONRepairError(`Invalid unicode character "${chars}"`, i);
  }

  function got() {
    return text[i] ? `but got '${text[i]}'` : "but reached end of input";
  }
}

function atEndOfBlockComment(text, i) {
  return text[i] === "*" && text[i + 1] === "/";
}

const input = `\t{"input_1.3": "Seth Hines", "input_2": "seth.hines@sproutsocial.com", "input_3": "2066127308", "input_4": "7153 30th Ave SW", "input_5": "2 Tress that need trimming"}`;
return jsonrepair(input);
