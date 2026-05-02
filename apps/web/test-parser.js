import { parseErrors } from "../../apps/web/src/services/errorParser.js";

const gccOutput = `main.cpp: In function 'int main()':
main.cpp:5:3: error: expected primary-expression before 'return'
    5 |   return 0;
      |   ^~~~~~`;

console.log(JSON.stringify(parseErrors(gccOutput, "cpp"), null, 2));
