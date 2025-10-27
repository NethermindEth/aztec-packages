$\newcommand{\endogroup}{\textcolor{orange}{\lambda}}$
$\newcommand{\endofield}{\textcolor{orange}{\beta}}$
$\newcommand{\rom}[1]{\textcolor{purple}{#1}}$
$\newcommand{\windex}[1]{\textcolor{grey}{#1}}$

### Lookup Tables in Biggroup

In the biggroup class, we use lookup tables to store precomputed multiples of a fixed group element $P$. Since we use the wNAF (windowed non-adjacent form) method for scalar multiplication, we need to store odd multiples of $P$ up to a certain window size. Further, to leverage endomorphism while computing scalar multiplication, we also store the endomorphic mapping of the multiples of $P$ in the table. For instance with a wNAF window size of 3, the lookup table for $P$ is represented as follows:

| Index | Element      | Endomorphism            |
| ----- | ------------ | ----------------------- |
| 0     | $-7 \cdot P$ | $-7 \endogroup \cdot P$ |
| 1     | $-5 \cdot P$ | $-5 \endogroup \cdot P$ |
| 2     | $-3 \cdot P$ | $-3 \endogroup \cdot P$ |
| 3     | $-1 \cdot P$ | $-1 \endogroup \cdot P$ |
| 4     | $1 \cdot P$  | $1 \endogroup \cdot P$  |
| 5     | $3 \cdot P$  | $3 \endogroup \cdot P$  |
| 6     | $5 \cdot P$  | $5 \endogroup \cdot P$  |
| 7     | $7 \cdot P$  | $7 \endogroup \cdot P$  |

Note that our wNAF form uses only (positive and negative) odd multiples of $P$ so as to avoid handling conditional logic in the circuit for 0 values. Each group element in the above table is represented as a point on the elliptic curve: $Q = (x, y)$ such that $x, y \in \mathbb{F}_q$. In our case, $\mathbb{F}_q$ is either the base field of BN254 or secp256k1 (or secp256r1). Since the native field used in our circuits is the scalar field $\mathbb{F}_r$ of BN254, $x$ and $y$ are non-native field elements and are represented as two `bigfield` elements, i.e., each of $x$ and $y$ consists of four binary-basis limbs and one prime-basis limb:

$$
\begin{aligned}
x &\equiv (x_0, x_1, x_2, x_3, x_p) & & \in \mathbb{F}_r^5, \\
y &\equiv (y_0, y_1, y_2, y_3, y_p) & & \in \mathbb{F}_r^5.
\end{aligned}
$$

Thus, when generating lookup tables, each element $Q$ in the table is represented as a tuple of 10 native field elements. Since we only support tables with one key and two values, we need 5 tables to represent the group element $Q$:

| Table 1: xlo |         |     | Table 2: xhi |         |
| ------------ | ------- | --- | ------------ | ------- |
| Value 1      | Value 2 |     | Value 1      | Value 2 |
| $x_0$        | $x_1$   |     | $x_2$        | $x_3$   |

| Table 3: ylo |         |     | Table 4: yhi |         |
| ------------ | ------- | --- | ------------ | ------- |
| Value 1      | Value 2 |     | Value 1      | Value 2 |
| $y_0$        | $y_1$   |     | $y_2$        | $y_3$   |

| Table 5: prime table |         |
| -------------------- | ------- |
| Value 1              | Value 2 |
| $x_p$                | $y_p$   |

Additionally, we also need tables for the endomorphism values. Suppose $x' := \endofield \cdot x$ is the x-coordinate of the endomorphism of the group element $Q$, represented as $x' = (x'_0, x'_1, x'_2, x'_3, x'_p) \in \mathbb{F}_r^5$. The endomorphism table is represented as follows:

| endo xlo table |         |     |     | endo xhi table |         |
| -------------- | ------- | --- | --- | -------------- | ------- |
| Value 1        | Value 2 |     |     | Value 1        | Value 2 |
| $x'_0$         | $x'_1$  |     |     | $x'_2$         | $x'_3$  |

| endo prime table |         |
| ---------------- | ------- |
| Value 1          | Value 2 |
| $x'_p$           | $y_p$   |

Note that since the y-coordinate remains unchanged under the endomorphism, we can use the same y-coordinate tables. For the prime-basis limb of the endomorphism, we use the same value $y_p$ (which is redundant but ensures consistency of using two-column tables). Thus, overall we need 8 tables to represent the lookup table for a group element $P$ with each table size being $2^3$ (for a wNAF window size of 3).

> Note:
> In the context of biggroup, we need variable-base lookup tables and fixed-base lookup tables. The variable-base lookup tables are used when the base point $P$ is not known at circuit synthesis time and is provided as a circuit witness. In this case, we need to generate the lookup tables on-the-fly based on the input base point $P$. On the other hand, fixed-base lookup tables are used when the base point $P$ is known at circuit synthesis time and can be hardcoded into the circuit (for example group generators). Fixed-base lookup tables are more efficient as they can be precomputed and do not require additional gates to enforce the correctness of the table entries. Variable-base lookup tables are realized using ROM tables (described below) while fixed-base lookup tables are realized using standard lookup tables in the circuit.

Refer to the [ROM table documentation](../memory/README.md) for details on how ROM tables are implemented in Barretenberg.

### wNAF with Stagger

Suppose we have a scalar $a \in \mathbb{F}_r$ that we want to represent in wNAF form with stagger and skew factors. If $a$ is an $N$-bit scalar and the number of stagger bits is $t$, then we can represent $a$ as follows:

$$
a = b \cdot \windex{2^t} + \mathfrak{c}_a
$$

where $\mathfrak{c}_a \in [0, 2^t)$ is the stagger part and $b$ is the remaining part of the scalar. We can then represent $b$ in wNAF form with its skew factor $\mathfrak{s}_b \in \{0, 1\}$ as follows:

$$
\begin{aligned}
a &:= \left( - \mathfrak{s}_b + \sum_{i=0}^{n-1} b_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + \mathfrak{c}_a
\end{aligned}
$$

where $b_i \in \{ -(2^{w} - 1), \ \dots \ , -3, -1, 1, 3, \ \dots \ , (2^{w} - 1)\}$ are the wNAF slices and $n = \left\lceil \frac{(N - t)}{w} \right\rceil$ is the number of wNAF slices with $w$ being the wNAF window size. The skew factor $\mathfrak{s}_b$ is used to represent even numbers, i.e., $\mathfrak{s}_b = 1$ if $b$ is even. We require the wNAF values to be signed odd digits to avoid the digit 0 as that would have to be handled conditionally in circuits. For more details on wNAF representation in barretenberg, refer to the [wNAF hackmd](https://hackmd.io/@aztec-network/rJ3VZcyZ9#wNAF-Representation-of-Scalars-in-mathbbF_r).
We can simplify the above expression as follows:

$$
\begin{aligned}
a = \left(\sum_{i=0}^{n-1} b_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\underbrace{\left(\mathfrak{c}_a - \mathfrak{s}_b \cdot \windex{2^t} \right)}_{\textsf{adjusted stagger}}
\end{aligned}
$$

The adjusted stagger term itself can be represented as wNAF slices. Let $\mathfrak{s}_c$ be the skew factor for the adjusted stagger term, then we can write:

$$
\begin{aligned}
a = \left(\sum_{i=0}^{n-1} b_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\underbrace{\left(-\mathfrak{s}_c + \sum_{i=0}^{m-1} c_i \cdot \windex{2^{wi}} \right),}_{\textsf{adjusted stagger in wnaf form}}
\end{aligned}
$$

where number of wNAF slices in the adjusted stagger term is $m = \left\lceil \frac{t}{w} \right\rceil$. In our implementation, we restrict the stagger bits $t \le w$ and thus $m = 1$:

$$
\begin{aligned}
a &:= \left(\sum_{i=0}^{n-1} b_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\underbrace{\left(-\mathfrak{s}_c + c_0 \right).}_{\textsf{adjusted stagger in wnaf form}}
\end{aligned}
\tag{1}
$$

One important detail here is that the raw wNAF value $e_i \in \{0, 1, \dots, 2^{w-1}\}$ along with a sign bit $\pi_i \in \{0, 1\}$ is used to represent the wNAF slices. The sign bit indicates whether the corresponding wNAF slice is positive or negative. To convert the raw wNAF value and sign bit to the signed-odd representation for our implementation, we use the following formula:

$$
\begin{aligned}
b_i &= (1 - 2 \pi_i) \cdot (2 e_i + 1) \\
&=
\begin{cases}
(2 e_i + 1), & \text{if } \pi_i = 0 \\
-(2 e_i + 1), & \text{if } \pi_i = 1
\end{cases}
\end{aligned}
$$

While reconstructing the scalar from its wNAF representation (in a circuit), we prefer to work with non-negative values. Since $|b_i| < 2^{w}$, to make the wNAF values positive, we add a bias of $2^{w}$ to each wNAF slice:

$$
\begin{aligned}
b_i + \windex{2^{w}} &=
\begin{cases}
(\windex{2^{w}} + 2 e_i + 1), & \text{if } \pi_i = 0 \\
(\windex{2^{w}} - 2 e_i - 1), & \text{if } \pi_i = 1
\end{cases} \\
&=
\begin{cases}
2 \cdot (\windex{2^{w - 1}} + e_i) + 1, & \text{if } \pi_i = 0 \\
2 \cdot (\windex{2^{w - 1}} - e_i - 1) + 1, & \text{if } \pi_i = 1
\end{cases} \\
& =: \ 2 \cdot e'_i + 1.
\end{aligned}
$$

We need to subtract this bias when reconstructing the scalar from its wNAF representation. Thus, the final scalar reconstruction formula is:

$$
\begin{aligned}
a &= \left(\sum_{i=0}^{n-1} (b_i + \windex{2^w}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + c_0 - \mathfrak{s}_c - \underbrace{ \left( \sum_{i=0}^{n-1} \windex{2^{w}} \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}}_{\textsf{bias correction}}
\end{aligned}
$$

Similarly, the wNAF slice $c_0$ in the adjusted stagger term can be represented in terms of its raw wNAF value and sign bit as follows:

$$
\begin{aligned}
c_0 &= (1 - 2 \pi) \cdot (2 c + 1) \\
&=
\begin{cases}
(2 c + 1), & \text{if } \pi = 0 \\
-(2 c + 1), & \text{if } \pi = 1
\end{cases}
\end{aligned}
$$

Here as well, we can add a bias of $2^{w}$ to make $c_0$ non-negative (and then subtract the bias when reconstructing the scalar):

$$
\begin{aligned}
c_0 + \windex{2^{w}} &=
\begin{cases}
(\windex{2^{w}} + 2 c + 1), & \text{if } \pi = 0 \\
(\windex{2^{w}} - 2 c - 1), & \text{if } \pi = 1
\end{cases} \\
&=
\begin{cases}
2 \cdot (\windex{2^{w - 1}} + c) + 1, & \text{if } \pi = 0 \\
2 \cdot (\windex{2^{w - 1}} - c - 1) + 1, & \text{if } \pi = 1
\end{cases} \\
& =: \ 2 \cdot c' + 1.
\end{aligned}
$$

Substituting the expression for $(b_i + \windex{2^{w}})$ and $(c_0 + \windex{2^{w}})$, we get:

$$
\begin{aligned}
a &= \left(\sum_{i=0}^{n-1} (2 \cdot e'_i + 1)
\cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (2 \cdot c' + 1) - \mathfrak{s}_c - \underbrace{\left( \left( \sum_{i=0}^{n-1} \windex{2^{w}} \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + \windex{2^{w}} \right)}_{\textsf{bias correction due to b and c}} \\
&= \left(\sum_{i=0}^{n-1} (2 \cdot e'_i)
\cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (2 \cdot c') - \mathfrak{s}_c - \underbrace{\left( \left( \sum_{i=0}^{n-1} (\windex{2^{w} - 1}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (\windex{2^{w} - 1}) \right)}_{\textsf{adjusted bias correction}} \\
&= \underbrace{2 \cdot \left( \left(\sum_{i=0}^{n-1} e'_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + c' \right)}_{\textsf{positive part}} -
\underbrace{\left(\mathfrak{s}_c + \left( \sum_{i=0}^{n-1} (\windex{2^{w} - 1}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (\windex{2^{w} - 1}) \right)}_{\textsf{negative part}} \\
\end{aligned}
$$

This expression is used in the circuit to reconstruct the scalar from its wNAF representation. The adjusted bias correction term is a constant that can be precomputed and hardcoded into the circuit.

#### Handling Large Scalars

When we have a scalar that is larger than $\frac{r}{2}$, to minimize the number of wNAF slices, we represent the negative of the scalar instead. Thus, for a scalar $a > \frac{r}{2}$, we define $a_{\textsf{negative}} := (r - a) < \frac{r}{2}$ as an $N$-bit scalar and represent $a_{\textsf{negative}}$ in wNAF form as described above. The final scalar multiplication is then computed as:

$$
\begin{aligned}
a \cdot P &= (r - a_{\textsf{negative}}) \cdot P \\
&= r \cdot P - a_{\textsf{negative}} \cdot P \\
&= - a_{\textsf{negative}} \cdot P
\end{aligned}
$$

Thus, to compute the wNAF representation of $-a_{\textsf{negative}} \in \mathbb{F}_r$, we can use the same expression as before (see Equation $(1)$). If $a_{\textsf{negative}}$ is represented as:

$$
\begin{aligned}
a_{\textsf{negative}} =
\left(\sum_{i=0}^{n-1} b_{i, \textsf{negative}} \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\underbrace{\left(-\mathfrak{s}_{c, \textsf{negative}} + c_{0, \textsf{negative}} \right).}_{\textsf{adjusted stagger in wnaf form}}
\end{aligned}
$$

$$
\begin{aligned}
\implies -a_{\textsf{negative}} &= \left(\sum_{i=0}^{n-1} -b_{i, \textsf{negative}} \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\mathfrak{s}_{c, \textsf{negative}} - c_{0, \textsf{negative}}.
\end{aligned}
$$

We can write the negative wNAF slices $-b_{i, \textsf{negative}}$ in terms of the raw wNAF values and sign bits as follows:

$$
\begin{aligned}
-b_{i, \textsf{negative}} &= -(1 - 2 \pi_{i, \textsf{negative}}) \cdot (2 e_{i, \text{negative}} + 1) \\
&=
\begin{cases}
-(2 e_{i, \text{negative}} + 1), & \text{if } \pi_{i, \textsf{negative}} = 0 \\
(2 e_{i, \text{negative}} + 1), & \text{if } \pi_{i, \textsf{negative}} = 1
\end{cases} \
\end{aligned}
$$

Similarly, we can add a bias of $2^{w}$ to each negative wNAF slice to make them non-negative:

$$
\begin{aligned}
-b_{i, \textsf{negative}} + 2^{w} &=
\begin{cases}
(\windex{2^{w}} - 2 e_{i, \text{negative}} - 1), & \text{if } \pi_{i, \textsf{negative}} = 0 \\
(\windex{2^{w}} + 2 e_{i, \text{negative}} + 1), & \text{if } \pi_{i, \textsf{negative}} = 1
\end{cases} \\
&=
\begin{cases}
2 \cdot (\windex{2^{w - 1}} - e_{i, \text{negative}} - 1) + 1, & \text{if } \pi_{i, \textsf{negative}} = 0 \\
2 \cdot (\windex{2^{w - 1}} + e_{i, \text{negative}}) + 1, & \text{if } \pi_{i, \textsf{negative}} = 1
\end{cases} \\
& =: \ 2 \cdot e'_{i, \textsf{negative}} + 1.
\end{aligned}
$$

We can similarly add a bias of $2^{w}$ to the adjusted stagger wNAF slice $c_{0, \textsf{negative}}$. Therefore, the final scalar reconstruction formula for $-a_{\textsf{negative}}$ is:

$$
\begin{aligned}
-a_{\textsf{negative}} &= \left(\sum_{i=0}^{n-1} (2e'_{i, \textsf{negative}}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (2 \cdot c'_{\textsf{negative}}) + \mathfrak{s}_{c, \textsf{negative}} \\
& \quad
 - \underbrace{\left( \left( \sum_{i=0}^{n-1} (\windex{2^{w} - 1}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (\windex{2^{w} - 1}) \right)}_{\textsf{adjusted bias correction for both b and c}}
\end{aligned}
$$

Notice that the terms $e'_{i, \textsf{negative}}$ and $c'_{\textsf{negative}}$ are similar to $e'_i$ and $c'$ respectively, except that the sign bits are flipped. Thus, we can use the same circuit logic to reconstruct both $a$ and $-a_{\textsf{negative}}$ from their wNAF representations with appropriate sign bit handling.

### MSM for ECDSA Verification

In ECDSA verification, we need to compute a multi-scalar multiplication (MSM) of the form:

$$
A = u_1 \cdot G + u_2 \cdot Q
$$

where $G \in \mathbb{G}$ is the generator point of the elliptic curve, $Q \in \mathbb{G}$ is the public key point, and $u_1, u_2 \in \mathbb{F}_r$ are scalars derived from the message hash and signature. Both $G$ and $Q$ are known points on the curve, and we can use fixed-base lookup tables for $G$ and variable-base lookup tables for $Q$. Specifically for $G$, we use 8-bit (fixed) lookup tables of the form:

$$
\begin{aligned}
\def\arraystretch{1.6}
\def\arraycolsep{40pt}
\begin{array}{|c|c|c|}
\hline
\textsf{Index} & \textsf{Element} & \textsf{Endomorphism} \\
\hline
0 & -255 \cdot G & -255 \endogroup \cdot G \\
\hline
1 & -253 \cdot G & -253 \endogroup \cdot G \\
\hline
\vdots & \vdots & \vdots \\
\hline
126 & -3 \cdot G & -3 \endogroup \cdot G \\
\hline
127 & -1 \cdot G & -1 \endogroup \cdot G \\
\hline
128 & 1 \cdot G & 1 \endogroup \cdot G \\
\hline
129 & 3 \cdot G & 3 \endogroup \cdot G \\
\hline
\vdots & \vdots & \vdots \\
\hline
254 & 253 \cdot G & 253 \endogroup \cdot G \\
\hline
255 & 255 \cdot G & 255 \endogroup \cdot G \\
\hline
\end{array}
\end{aligned}
$$

and for $Q$, we use 4-bit ROM tables as described earlier. The scalars $u_1$ and $u_2$ are first split into 128-bit scalars using endomorphism:

$$
\begin{aligned}
u_1 \cdot G &= f' \cdot \lambda G + f \cdot G, \\
u_2 \cdot Q &= v' \cdot \lambda Q + v \cdot Q.
\end{aligned}
$$

where $f, f'$ denote fixed-base scalars and $v, v'$ denote variable-base scalars. Each of these scalars are at most 128 bits long and can be represented in wNAF form with stagger and skew factors as shown in the example below:

$$
\def\arraystretch{1.4}
\begin{array}{|r|c|ccccccccccccccccccccc|}
\hline
\textsf{scalar} & \textsf{point} & \windex{2^{19}} & \windex{2^{18}} & \windex{2^{17}} & \windex{2^{16}} & \windex{2^{15}} & \windex{2^{14}} & \windex{2^{13}} & \windex{2^{12}} & \windex{2^{11}} & \windex{2^{10}} & \windex{2^9} & \windex{2^8} & \windex{2^7} & \windex{2^6} & \windex{2^5} & \windex{2^4} & \windex{2^3} & \windex{2^2} & \windex{2^1} & \windex{2^0} \\ \hline
f' & \lambda G & & \windex{0} & \windex{0} & \windex{0} & \textcolor{orange}{1} & \textcolor{orange}{0} & \textcolor{orange}{1} & \textcolor{orange}{1} & \textcolor{orange}{0} & \textcolor{orange}{1} & \textcolor{orange}{1} & \textcolor{orange}{0} & \textcolor{orange}{0} & \textcolor{orange}{0} & \textcolor{orange}{1} & \textcolor{orange}{0} & \textcolor{orange}{1} & \textcolor{red}{1} & \textcolor{red}{1} & \textcolor{red}{0}
\\
w\textsf{NAF} & & & \textcolor{orange}{\lfloor} & & & & \textcolor{orange}{f'_1} & & & \textcolor{orange}{\rfloor} & \textcolor{orange}{\lfloor} &  & & & \textcolor{orange}{f'_0} & & & \textcolor{orange}{\rfloor} & \textcolor{red}{\lfloor} & \textcolor{red}{c_{f'}} & \textcolor{red}{\rfloor}
\\ \hline
f & G & & & \windex{0} & \windex{0} & \textcolor{orange}{1} & \textcolor{orange}{1} & \textcolor{orange}{0} & \textcolor{orange}{1} & \textcolor{orange}{0} & \textcolor{orange}{0} & \textcolor{orange}{0} & \textcolor{orange}{1} & \textcolor{orange}{0} & \textcolor{orange}{0} & \textcolor{orange}{1} & \textcolor{orange}{1} & \textcolor{orange}{1} & \textcolor{orange}{0} & \textcolor{red}{0} & \textcolor{red}{1}
\\
w\textsf{NAF} & & & & \textcolor{orange}{\lfloor} & & & & \textcolor{orange}{f_1} & & & \textcolor{orange}{\rfloor} & \textcolor{orange}{\lfloor} &  & & & \textcolor{orange}{f_0} & & & \textcolor{orange}{\rfloor} & \textcolor{red}{\lfloor} & \textcolor{red}{c_{f}} \textcolor{red}{\rfloor}
\\ \hline
v' & \lambda Q & & & & \windex{0} & \textcolor{skyblue}{1} & \textcolor{skyblue}{1} & \textcolor{skyblue}{0} & \textcolor{violet}{1} & \textcolor{violet}{1} & \textcolor{violet}{1} & \textcolor{violet}{0} & \textcolor{skyblue}{0} & \textcolor{skyblue}{1} & \textcolor{skyblue}{1} & \textcolor{skyblue}{0} & \textcolor{violet}{0} & \textcolor{violet}{0} & \textcolor{violet}{1} & \textcolor{violet}{1} & \textcolor{red}{1}
\\
w\textsf{NAF} & & & & & \textcolor{skyblue}{\lfloor} & & \textcolor{skyblue}{v'_3} & \textcolor{skyblue}{\rfloor} & \textcolor{violet}{\lfloor} & & \textcolor{violet}{v'_2} & \textcolor{violet}{\rfloor} & \textcolor{skyblue}{\lfloor} & & \textcolor{skyblue}{v'_1} & \textcolor{skyblue}{\rfloor} & \textcolor{violet}{\lfloor} & & \textcolor{violet}{v'_0} & \textcolor{violet}{\rfloor} & \textcolor{red}{c_{v'}}
\\ \hline
v & Q & \textcolor{yellow}{1} & \textcolor{yellow}{0} & \textcolor{yellow}{0} & \textcolor{yellow}{0} & \textcolor{skyblue}{1} & \textcolor{skyblue}{1} & \textcolor{skyblue}{0} & \textcolor{skyblue}{1} & \textcolor{violet}{0} & \textcolor{violet}{1} & \textcolor{violet}{0} & \textcolor{violet}{1} & \textcolor{skyblue}{1} & \textcolor{skyblue}{0} & \textcolor{skyblue}{1} & \textcolor{skyblue}{1} & \textcolor{violet}{1} & \textcolor{violet}{0} & \textcolor{violet}{0} & \textcolor{violet}{1}
\\
w\textsf{NAF} & & \textcolor{yellow}{\lfloor} & & \textcolor{yellow}{v_4} & \textcolor{yellow}{\rfloor} & \textcolor{skyblue}{\lfloor} & & \textcolor{skyblue}{v_3} & \textcolor{skyblue}{\rfloor} & \textcolor{violet}{\lfloor} & & \textcolor{violet}{v_2} & \textcolor{violet}{\rfloor} & \textcolor{skyblue}{\lfloor} & & \textcolor{skyblue}{v_1} &   \textcolor{skyblue}{\rfloor} & \textcolor{violet}{\lfloor} & & \textcolor{violet}{v_0} & \textcolor{violet}{\rfloor} \\ \hline
\end{array}
$$

Since we have 8-bit tables for the generator $G$, we use a wNAF window size of $w = 8$ for the fixed-base scalars $f, f'$. For the variable-base scalars $v, v'$, we use a wNAF window size of $w = 4$ since we have 4-bit ROM tables for $Q$. The stagger bits are 0 and 1 for $v$ and $v'$ respectively, and 2 and 3 for $f$ and $f'$ respectively. We will explain the reason for this choice of stagger bits soon. Notice an extra wNAF term in $v$ (shown in yellow). The final MSM expression combining all the terms should look like this:

$$
\begin{aligned}
A =&\ \windex{2^0} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{violet}{v_0} \cdot Q}} +
\windex{2^1} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{violet}{v'_0} \cdot (\lambda Q)}} +
\windex{2^2} \cdot \underset{\textsf{regular lookup}}{\boxed{\textcolor{orange}{f_0} \cdot G}} +
\windex{2^{3}} \cdot \underset{\textsf{regular lookup}}{\boxed{\textcolor{orange}{f'_0} \cdot (\lambda G)}} +
\windex{2^{4}} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{skyblue}{v_1} \cdot Q}} +
\windex{2^{5}} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{skyblue}{v'_1} \cdot (\lambda Q)}}
+ \\[10pt]
&\  \windex{2^8} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{violet}{v_2} \cdot Q}} +
\windex{2^9} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{violet}{v'_2} \cdot (\lambda Q)}} +
\windex{2^{10}} \cdot \underset{\textsf{regular lookup}}{\boxed{\textcolor{orange}{f_1} \cdot G}} +
\windex{2^{11}} \cdot \underset{\textsf{regular lookup}}{\boxed{\textcolor{orange}{f'_1} \cdot (\lambda G)}} +
\windex{2^{12}} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{skyblue}{v_3} \cdot Q}} +
\windex{2^{13}} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{skyblue}{v'_3} \cdot (\lambda Q)}} + \windex{2^{16}} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{yellow}{v_4} \cdot Q}}
\\[10pt]
&\ + \ \underbrace{\underset{\textsf{regular lookup}}{\boxed{\textcolor{red}{c_f} \cdot G}} + \underset{\textsf{regular lookup}}{\boxed{\textcolor{red}{c_{f'}} \cdot (\lambda G)}} + \underset{\textsf{ROM lookup}}{\boxed{\textcolor{red}{c_{v'}} \cdot (\lambda Q)}}}_{\textsf{stagger fragments}}
\\[10pt]
&\ + \
\underbrace{\textcolor{orange}{\mathfrak{s}_{f}} \cdot G +
\textcolor{orange}{\mathfrak{s}_{f'}} \cdot (\lambda G) +
\textcolor{skyblue}{\mathfrak{s}_{v}} \cdot Q +
\textcolor{skyblue}{\mathfrak{s}_{v'}} \cdot (\lambda Q)}_{\textsf{skew terms}},
\\[20pt]
=&\ S_0 + \windex{2^6} \cdot \left(\windex{2^2} \cdot S_1\right) + \windex{2^{12}} \cdot \left(\windex{2^4} \cdot \boxed{\textcolor{yellow}{v_4} \cdot Q} \ \right) + \textsf{stagger} + \textsf{skew}
\end{aligned}
$$

where

$$
\begin{aligned}
S_0 =&\ \windex{2^0} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{violet}{v_0} \cdot Q}} +
\windex{2^1} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{violet}{v'_0} \cdot (\lambda Q)}} +
\windex{2^2} \cdot \underset{\textsf{regular lookup}}{\boxed{\textcolor{orange}{f_0} \cdot G}} +
\windex{2^{3}} \cdot \underset{\textsf{regular lookup}}{\boxed{\textcolor{orange}{f'_0} \cdot (\lambda G)}} +
\windex{2^{4}} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{skyblue}{v_1} \cdot Q}} +
\windex{2^{5}} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{skyblue}{v'_1} \cdot (\lambda Q)}},
\\[10pt]
S_1 =&\ \windex{2^0} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{violet}{v_2} \cdot Q}} +
\windex{2^1} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{violet}{v'_2} \cdot (\lambda Q)}} +
\windex{2^2} \cdot \underset{\textsf{regular lookup}}{\boxed{\textcolor{orange}{f_1} \cdot G}} +
\windex{2^{3}} \cdot \underset{\textsf{regular lookup}}{\boxed{\textcolor{orange}{f'_1} \cdot (\lambda G)}} +
\windex{2^{4}} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{skyblue}{v_3} \cdot Q}} +
\windex{2^{5}} \cdot \underset{\textsf{ROM lookup}}{\boxed{\textcolor{skyblue}{v'_3} \cdot (\lambda Q)}}.
\end{aligned}
$$

We can see a pattern here that the wNAF slices can be grouped based on their bit positions and use Montgomery ladder steps of size 6 to compute the MSM efficiently. This pattern is the reason for our choice of stagger bits for the scalars. We can compute the MSM using the following sequence of operations.

$$
\begin{aligned}
\textsf{step 0:} & & \textsf{acc} \leftarrow&\ \boxed{\textcolor{yellow}{v_4} \cdot Q} \\
\textsf{step 1:} & & \textsf{acc} \leftarrow&\ \windex{2} \cdot (\windex{2} \cdot \textsf{acc}) \\
\textsf{step 2:} & & \textsf{acc} \leftarrow&\
\windex{2} \cdot
\Bigg(
\windex{2} \cdot
\bigg(
\windex{2} \cdot
\Big(
   \windex{2} \cdot
   \big(
      \windex{2} \cdot
      (
         \windex{2} \cdot \textsf{acc} +
         \mathcal{Q}_{\lambda}[\textcolor{skyblue}{v'_1}]
      ) +
      \mathcal{Q}[\textcolor{skyblue}{v_1}]
   \big) +
   \mathcal{G}_{\lambda}[\textcolor{orange}{f'_0}]
\Big) +
\mathcal{G}[\textcolor{orange}{f_0}]
\bigg) +
\mathcal{Q}_{\lambda}[\textcolor{violet}{v'_0}]
\Bigg) +
\mathcal{Q}[\textcolor{violet}{v_0}]
\\
\textsf{step 3:} & & \textsf{acc} \leftarrow&\ \windex{2} \cdot (\windex{2} \cdot \textsf{acc}) \\
\textsf{step 4:} & & \textsf{acc} \leftarrow&\
\windex{2} \cdot
\Bigg(
\windex{2} \cdot
\Bigg(
\windex{2} \cdot
\Big(
   \windex{2} \cdot
   \bigg(
      \windex{2} \cdot
      \Big(
         \windex{2} \cdot \textsf{acc} +
         \mathcal{Q}_{\lambda}[\textcolor{skyblue}{v'_3}]
      ) +
      \mathcal{Q}[\textcolor{skyblue}{v_3}]
   \bigg) +
   \mathcal{G}_{\lambda}[\textcolor{orange}{f'_1}]
\Big) +
\mathcal{G}[\textcolor{orange}{f_1}]
\Bigg) +
\mathcal{Q}_{\lambda}[\textcolor{violet}{v'_2}]
\Bigg) +
\mathcal{Q}[\textcolor{violet}{v_2}]
\end{aligned}
$$

where $\mathcal{Q}, \ \mathcal{Q}_{\lambda}$ and $\mathcal{G}, \ \mathcal{G}_{\lambda}$ are the lookup tables for the ROM and regular lookups, respectively. Next, we add the stagger fragments to the accumulator to get the final MSM result:

$$
\begin{aligned}
A = \textsf{acc} +
\mathcal{Q}[\textcolor{red}{c_f}] +
\mathcal{Q}_{\lambda}[\textcolor{red}{c_{f'}}] +
\mathcal{G}_{\lambda}[\textcolor{red}{c_{v'}}].
\end{aligned}
$$

Finally, we need to adjust the skew factors for each scalar multiplication. Thus, the final MSM output with skew adjustments is:

$$
\begin{aligned}
A \leftarrow&\ A + \textcolor{orange}{\mathfrak{s}_{f}} \cdot G +
\textcolor{orange}{\mathfrak{s}_{f'}} \cdot (\lambda G) +
\textcolor{skyblue}{\mathfrak{s}_{v}} \cdot Q +
\textcolor{skyblue}{\mathfrak{s}_{v'}} \cdot (\lambda Q).
\end{aligned}
$$

Since our scalars are at most 128 bits long after endomorphism, we can represent the fixed-base scalars using at most 16 wNAF slices (as the window size is $w = 8$) and the variable-base scalars using at most 32 wNAF slices (as the window size is $w = 4$). We choose to represent the scalar $v \in \mathbb{F}_r$ using 33 wNAF slices instead of 32 to because we initialise the accumulator with the extra slice $\textcolor{yellow}{v_4}$ at the start of the MSM computation. This allows us to use a uniform pattern of Montgomery ladder steps of size 6 throughout the MSM computation. In total, we perform 16 rounds each consisting of 2 Montgomery ladder steps of size 6, resulting in a total of 32 ladder steps to compute the MSM.

### Signed Digit Representation

We can write the bit representation of an $n$-bit scalar $a$ with bits $a_0, a_1 \dots, a_{n - 1} \in \{0, 1\}$ as follows:

$$
\begin{aligned}
a &= \sum_{i=0}^{n-1} a_{i} \cdot \windex{2^{i}} \\
&= a_0 + \sum_{i=1}^{n-1} (2 \cdot a_{i}) \cdot \windex{2^{i - 1}} \\
&= a_0 + \sum_{i=1}^{n-1} (2 \cdot a_{i} - 1) \cdot \windex{2^{i - 1}}  + \underbrace{\sum_{i=1}^{n-1} \windex{2^{i - 1}}}_{\textsf{adjusted offset}} \\
&= a_0 + \sum_{i=1}^{n-1} (1 - 2 \cdot (1 - a_{i})) \cdot \windex{2^{i - 1}}  + \underbrace{(2^{n-1} - 1)}_{\textsf{adjusted offset}} \\
&= (a_0 - 1) + \sum_{i=1}^{n} (1 - 2 \cdot a'_{i}) \cdot \windex{2^{i - 1}}  \qquad \textsf{s.t. } a'_{n} = 0 \\
&= -(1 - a_0) + \sum_{i=0}^{n-1} \underbrace{(1 - 2 \cdot a'_{i+1})}_{b_i} \cdot \windex{2^{i}}  \qquad \textsf{s.t. } a'_{n} = 0 \\
\end{aligned}
$$

Here, $a'_{i + 1} \in \{0, 1\}$ are the signed digit representation of the scalar $a$ with the most significant digit $a'_n = 0$. Therefore, the new digits $b_i := (1 - 2 \cdot a'_{i + 1})$ can take values in $\{-1, 1\}$.
The term $(1 - a_0)$ is the skew factor $\mathfrak{s}_a \in \{0, 1\}$ which is 1 for even scalars and 0 for odd scalars. Thus, the final representation of an $n$-bit odd scalar $a$ in signed digit form is:

$$
\begin{aligned}
a &= -\mathfrak{s}_a + \sum_{i=0}^{n-1} b_i \cdot \windex{2^{i}}  \qquad \textsf{s.t. } b_i \in \{-1, 1\} \\
\end{aligned}
$$

where $\mathfrak{s}_a = 0$ if $a$ is odd and $\mathfrak{s}_a = 1$ if $a$ is even. Given $a'_{1}, \ldots, a'_{n}$, the signed digit representation of the scalar $a$, we can reconstruct the scalar $a$ in a circuit using the following formula:

$$
\begin{aligned}
a &= -\mathfrak{s}_a + \sum_{i=0}^{n-1} (1 - 2 \cdot a'_{i+1}) \cdot \windex{2^{i}} \\
&= -\mathfrak{s}_a + \sum_{i=0}^{n-1} (1 - a'_{i+1} - a'_{i+1}) \cdot \windex{2^{i}} \\
&= \underbrace{\sum_{i=0}^{n-1} (1 - a'_{i+1}) \cdot \windex{2^{i}}}_{\textsf{positive part}} - \underbrace{\left(\mathfrak{s}_a + \sum_{i=0}^{n-1} a'_{i+1} \cdot \windex{2^{i}} \right)}_{\textsf{negative part}}. \\
\end{aligned}
$$

Note that the positive and negative parts are both non-negative and can be computed in a circuit without any conditional logic.
